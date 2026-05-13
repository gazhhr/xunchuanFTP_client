package com.swiftftp.app.plugin;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.apache.commons.net.ftp.FTP;
import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTPFile;
import org.apache.commons.net.ftp.FTPReply;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

@CapacitorPlugin(name = "FTPClient")
public class FTPPlugin extends Plugin {
    private static final String TAG = "FTPPlugin";
    private FTPClient ftpClient;
    private boolean isConnected = false;
    private String currentRemotePath = "/";
    private final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());

    /**
     * Helper: get the Android external storage base path
     */
    private String getExternalStoragePath() {
        return Environment.getExternalStorageDirectory().getAbsolutePath();
    }

    @PluginMethod
    public void checkStoragePermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+: check MANAGE_EXTERNAL_STORAGE
            boolean granted = Environment.isExternalStorageManager();
            result.put("granted", granted);
            result.put("permission", "MANAGE_EXTERNAL_STORAGE");
            result.put("androidVersion", Build.VERSION.SDK_INT);
            call.resolve(result);
        } else {
            // Android 10 and below
            boolean readGranted = ContextCompat.checkSelfPermission(getContext(),
                    Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
            boolean writeGranted = ContextCompat.checkSelfPermission(getContext(),
                    Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
            result.put("granted", readGranted && writeGranted);
            result.put("readGranted", readGranted);
            result.put("writeGranted", writeGranted);
            result.put("androidVersion", Build.VERSION.SDK_INT);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void requestStoragePermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+: open system settings for MANAGE_EXTERNAL_STORAGE
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                result.put("action", "opened_settings");
                result.put("message", "Please enable 'All files access' for this app in settings");
            } catch (Exception e) {
                // Fallback to app-specific settings
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                result.put("action", "opened_app_settings");
            }
            call.resolve(result);
        } else {
            // Android 10 and below: request runtime permissions
            ActivityCompat.requestPermissions(getActivity(),
                    new String[]{
                            Manifest.permission.READ_EXTERNAL_STORAGE,
                            Manifest.permission.WRITE_EXTERNAL_STORAGE
                    }, 1001);
            result.put("action", "requested_runtime_permissions");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void getStoragePath(PluginCall call) {
        JSObject result = new JSObject();
        result.put("path", getExternalStoragePath());
        result.put("downloads", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath());
        result.put("documents", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS).getAbsolutePath());
        call.resolve(result);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 21);
        String username = call.getString("username", "anonymous");
        String password = call.getString("password", "");

        if (host == null || host.isEmpty()) {
            call.reject("Host is required");
            return;
        }

        if (ftpClient != null && ftpClient.isConnected()) {
            try {
                ftpClient.disconnect();
            } catch (IOException e) {
                Log.w(TAG, "Error disconnecting", e);
            }
        }

        ftpClient = new FTPClient();
        // CRITICAL: Set UTF-8 encoding BEFORE connection for Chinese support
        ftpClient.setControlEncoding("UTF-8");
        ftpClient.setConnectTimeout(15000);
        ftpClient.setDefaultTimeout(15000);
        ftpClient.setDataTimeout(30000);

        new Thread(() -> {
            try {
                ftpClient.connect(host, port);
                int reply = ftpClient.getReplyCode();
                if (!FTPReply.isPositiveCompletion(reply)) {
                    ftpClient.disconnect();
                    call.reject("FTP server refused connection: " + reply);
                    return;
                }

                boolean loginSuccess = ftpClient.login(username, password);
                if (!loginSuccess) {
                    ftpClient.disconnect();
                    call.reject("Login failed: invalid username or password");
                    return;
                }

                // Enable UTF-8 mode for Chinese filename support
                try {
                    ftpClient.sendCommand("OPTS UTF8", "ON");
                } catch (Exception e) {
                    Log.w(TAG, "Server may not support UTF-8, continuing...", e);
                }

                ftpClient.enterLocalPassiveMode();
                ftpClient.setFileType(FTP.BINARY_FILE_TYPE);
                ftpClient.setListHiddenFiles(false);

                // Set UTF-8 encoding for file transfers too
                ftpClient.setAutodetectUTF8(true);

                isConnected = true;
                currentRemotePath = ftpClient.printWorkingDirectory();
                if (currentRemotePath == null || currentRemotePath.isEmpty()) {
                    currentRemotePath = "/";
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("currentPath", currentRemotePath);
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "Connection error", e);
                isConnected = false;
                call.reject("Connection failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        new Thread(() -> {
            try {
                if (ftpClient != null && ftpClient.isConnected()) {
                    ftpClient.logout();
                    ftpClient.disconnect();
                }
                isConnected = false;
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "Disconnect error", e);
                isConnected = false;
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            }
        }).start();
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", isConnected && ftpClient != null && ftpClient.isConnected());
        result.put("currentPath", currentRemotePath);
        call.resolve(result);
    }

    @PluginMethod
    public void listDirectory(PluginCall call) {
        if (!checkConnected(call)) return;
        String path = call.getString("path", currentRemotePath);

        new Thread(() -> {
            try {
                // Re-ensure UTF-8 before listing
                ftpClient.setControlEncoding("UTF-8");
                
                FTPFile[] files = ftpClient.listFiles(path);
                JSArray fileList = new JSArray();

                // Add parent directory
                if (!path.equals("/") && !path.isEmpty()) {
                    JSObject parentDir = new JSObject();
                    parentDir.put("name", "..");
                    parentDir.put("type", "directory");
                    parentDir.put("size", 0);
                    parentDir.put("modifiedTime", "");
                    parentDir.put("permissions", "drwxr-xr-x");
                    parentDir.put("path", getParentPath(path));
                    fileList.put(parentDir);
                }

                for (FTPFile file : files) {
                    String name = file.getName();
                    if (name == null || name.equals(".") || name.equals("..")) {
                        continue;
                    }
                    
                    // Try to decode Chinese filenames
                    try {
                        // If the name looks like it was double-encoded, try to fix it
                        if (name.contains("\\x") || name.contains("?")) {
                            // The filename may have encoding issues
                            Log.w(TAG, "Potential encoding issue with filename: " + name);
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Filename encoding check error", e);
                    }

                    JSObject fileObj = new JSObject();
                    fileObj.put("name", name);
                    fileObj.put("type", file.isDirectory() ? "directory" : "file");
                    fileObj.put("size", file.getSize());
                    Date modified = file.getTimestamp() != null ? file.getTimestamp().getTime() : null;
                    fileObj.put("modifiedTime", modified != null ? dateFormat.format(modified) : "");
                    fileObj.put("permissions", getPermissionsString(file));
                    fileObj.put("path", path.endsWith("/") ? path + name : path + "/" + name);
                    fileList.put(fileObj);
                }

                JSObject result = new JSObject();
                result.put("files", fileList);
                result.put("path", path);
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "List directory error", e);
                call.reject("Failed to list directory: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void changeDirectory(PluginCall call) {
        if (!checkConnected(call)) return;
        String path = call.getString("path");
        if (path == null) {
            call.reject("Path is required");
            return;
        }

        new Thread(() -> {
            try {
                boolean success = ftpClient.changeWorkingDirectory(path);
                if (success) {
                    currentRemotePath = ftpClient.printWorkingDirectory();
                    JSObject result = new JSObject();
                    result.put("success", true);
                    result.put("currentPath", currentRemotePath);
                    call.resolve(result);
                } else {
                    call.reject("Failed to change directory");
                }
            } catch (IOException e) {
                Log.e(TAG, "Change directory error", e);
                call.reject("Error: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        if (!checkConnected(call)) return;
        String remotePath = call.getString("remotePath");
        String localPath = call.getString("localPath");

        if (remotePath == null || localPath == null) {
            call.reject("remotePath and localPath are required");
            return;
        }

        new Thread(() -> {
            try {
                Log.d(TAG, "Downloading from " + remotePath + " to " + localPath);

                // Ensure parent directory exists
                File localFile = new File(localPath);
                File parentDir = localFile.getParentFile();
                if (parentDir != null && !parentDir.exists()) {
                    boolean mkdirs = parentDir.mkdirs();
                    Log.d(TAG, "Created parent dirs: " + mkdirs + " for " + parentDir.getAbsolutePath());
                }

                // Use buffered stream for better performance
                OutputStream fos = new BufferedOutputStream(new FileOutputStream(localFile));

                ftpClient.setControlEncoding("UTF-8");
                boolean success = ftpClient.retrieveFile(remotePath, fos);
                fos.close();

                if (success) {
                    Log.d(TAG, "Download successful: " + localFile.getAbsolutePath() + " size=" + localFile.length());
                    JSObject result = new JSObject();
                    result.put("success", true);
                    result.put("localPath", localPath);
                    result.put("size", localFile.length());
                    call.resolve(result);
                } else {
                    int replyCode = ftpClient.getReplyCode();
                    String replyString = ftpClient.getReplyString();
                    Log.e(TAG, "Download failed. Reply code: " + replyCode + " msg: " + replyString);
                    localFile.delete(); // Clean up partial file
                    call.reject("Download failed: server returned code " + replyCode + " - " + replyString);
                }
            } catch (IOException e) {
                Log.e(TAG, "Download error", e);
                call.reject("Download failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void uploadFile(PluginCall call) {
        if (!checkConnected(call)) return;
        String localPath = call.getString("localPath");
        String remotePath = call.getString("remotePath");

        if (localPath == null || remotePath == null) {
            call.reject("localPath and remotePath are required");
            return;
        }

        new Thread(() -> {
            try {
                Log.d(TAG, "Uploading from " + localPath + " to " + remotePath);

                File localFile = new File(localPath);
                if (!localFile.exists()) {
                    call.reject("Local file does not exist: " + localPath);
                    return;
                }

                if (!localFile.canRead()) {
                    call.reject("Cannot read local file: " + localPath);
                    return;
                }

                InputStream fis = new BufferedInputStream(new FileInputStream(localFile));
                ftpClient.setControlEncoding("UTF-8");
                boolean success = ftpClient.storeFile(remotePath, fis);
                fis.close();

                if (success) {
                    Log.d(TAG, "Upload successful: " + remotePath);
                    JSObject result = new JSObject();
                    result.put("success", true);
                    call.resolve(result);
                } else {
                    int replyCode = ftpClient.getReplyCode();
                    String replyString = ftpClient.getReplyString();
                    Log.e(TAG, "Upload failed. Reply code: " + replyCode + " msg: " + replyString);
                    call.reject("Upload failed: server returned code " + replyCode + " - " + replyString);
                }
            } catch (IOException e) {
                Log.e(TAG, "Upload error", e);
                call.reject("Upload failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        if (!checkConnected(call)) return;
        String path = call.getString("path");
        boolean isDirectory = call.getBoolean("isDirectory", false);

        if (path == null) {
            call.reject("Path is required");
            return;
        }

        new Thread(() -> {
            try {
                boolean success;
                if (isDirectory) {
                    // Try to remove directory (must be empty)
                    success = ftpClient.removeDirectory(path);
                } else {
                    success = ftpClient.deleteFile(path);
                }
                JSObject result = new JSObject();
                result.put("success", success);
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "Delete error", e);
                call.reject("Delete failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void createDirectory(PluginCall call) {
        if (!checkConnected(call)) return;
        String name = call.getString("name");

        if (name == null) {
            call.reject("Name is required");
            return;
        }

        new Thread(() -> {
            try {
                boolean success = ftpClient.makeDirectory(name);
                JSObject result = new JSObject();
                result.put("success", success);
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "Create directory error", e);
                call.reject("Failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void rename(PluginCall call) {
        if (!checkConnected(call)) return;
        String oldPath = call.getString("oldPath");
        String newPath = call.getString("newPath");

        if (oldPath == null || newPath == null) {
            call.reject("oldPath and newPath are required");
            return;
        }

        new Thread(() -> {
            try {
                boolean success = ftpClient.rename(oldPath, newPath);
                JSObject result = new JSObject();
                result.put("success", success);
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "Rename error", e);
                call.reject("Rename failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void createLocalDir(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Path is required");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(path);
                boolean success = dir.mkdirs();
                JSObject result = new JSObject();
                result.put("success", success);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Create local dir error", e);
                call.reject("Failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void deleteLocalFile(PluginCall call) {
        String path = call.getString("path");
        boolean isDirectory = call.getBoolean("isDirectory", false);
        if (path == null) {
            call.reject("Path is required");
            return;
        }
        new Thread(() -> {
            try {
                File file = new File(path);
                boolean success;
                if (isDirectory && file.isDirectory()) {
                    success = deleteRecursive(file);
                } else {
                    success = file.delete();
                }
                JSObject result = new JSObject();
                result.put("success", success);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Delete local file error", e);
                call.reject("Failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void renameLocalFile(PluginCall call) {
        String oldPath = call.getString("oldPath");
        String newPath = call.getString("newPath");
        if (oldPath == null || newPath == null) {
            call.reject("oldPath and newPath are required");
            return;
        }
        new Thread(() -> {
            try {
                File oldFile = new File(oldPath);
                File newFile = new File(newPath);
                boolean success = oldFile.renameTo(newFile);
                JSObject result = new JSObject();
                result.put("success", success);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Rename local file error", e);
                call.reject("Failed: " + e.getMessage());
            }
        }).start();
    }

    private boolean deleteRecursive(File fileOrDirectory) {
        if (fileOrDirectory.isDirectory()) {
            File[] children = fileOrDirectory.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        return fileOrDirectory.delete();
    }

    @PluginMethod
    public void listLocalDirectory(PluginCall call) {
        String path = call.getString("path", getExternalStoragePath());

        new Thread(() -> {
            try {
                File dir = new File(path);
                if (!dir.exists() || !dir.isDirectory()) {
                    call.reject("Directory does not exist: " + path);
                    return;
                }

                JSArray fileList = new JSArray();

                // Add parent directory
                File parentFile = dir.getParentFile();
                if (parentFile != null) {
                    JSObject parentDir = new JSObject();
                    parentDir.put("name", "..");
                    parentDir.put("type", "directory");
                    parentDir.put("size", 0);
                    parentDir.put("modifiedTime", "");
                    parentDir.put("permissions", "drwxr-xr-x");
                    parentDir.put("path", parentFile.getAbsolutePath());
                    fileList.put(parentDir);
                }

                File[] files = dir.listFiles();
                if (files != null) {
                    for (File file : files) {
                        // Skip hidden files
                        if (file.getName().startsWith(".")) continue;

                        JSObject fileObj = new JSObject();
                        fileObj.put("name", file.getName());
                        fileObj.put("type", file.isDirectory() ? "directory" : "file");
                        fileObj.put("size", file.length());
                        fileObj.put("modifiedTime", dateFormat.format(new Date(file.lastModified())));
                        fileObj.put("permissions", file.isDirectory() ? "drwxr-xr-x" : "rw-r--r--");
                        fileObj.put("path", file.getAbsolutePath());
                        fileList.put(fileObj);
                    }
                }

                JSObject result = new JSObject();
                result.put("files", fileList);
                result.put("path", dir.getAbsolutePath());
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "List local directory error", e);
                call.reject("Failed to list directory: " + e.getMessage());
            }
        }).start();
    }

    private boolean checkConnected(PluginCall call) {
        if (!isConnected || ftpClient == null || !ftpClient.isConnected()) {
            call.reject("Not connected to FTP server");
            return false;
        }
        return true;
    }

    private String getParentPath(String path) {
        if (path == null || path.equals("/")) return "/";
        int lastSlash = path.lastIndexOf('/');
        if (lastSlash <= 0) return "/";
        return path.substring(0, lastSlash);
    }

    private String getPermissionsString(FTPFile file) {
        StringBuilder sb = new StringBuilder();
        sb.append(file.isDirectory() ? 'd' : '-');
        sb.append((file.hasPermission(FTPFile.USER_ACCESS, FTPFile.READ_PERMISSION)) ? 'r' : '-');
        sb.append((file.hasPermission(FTPFile.USER_ACCESS, FTPFile.WRITE_PERMISSION)) ? 'w' : '-');
        sb.append((file.hasPermission(FTPFile.USER_ACCESS, FTPFile.EXECUTE_PERMISSION)) ? 'x' : '-');
        sb.append((file.hasPermission(FTPFile.GROUP_ACCESS, FTPFile.READ_PERMISSION)) ? 'r' : '-');
        sb.append((file.hasPermission(FTPFile.GROUP_ACCESS, FTPFile.WRITE_PERMISSION)) ? 'w' : '-');
        sb.append((file.hasPermission(FTPFile.GROUP_ACCESS, FTPFile.EXECUTE_PERMISSION)) ? 'x' : '-');
        sb.append((file.hasPermission(FTPFile.WORLD_ACCESS, FTPFile.READ_PERMISSION)) ? 'r' : '-');
        sb.append((file.hasPermission(FTPFile.WORLD_ACCESS, FTPFile.WRITE_PERMISSION)) ? 'w' : '-');
        sb.append((file.hasPermission(FTPFile.WORLD_ACCESS, FTPFile.EXECUTE_PERMISSION)) ? 'x' : '-');
        return sb.toString();
    }
}
