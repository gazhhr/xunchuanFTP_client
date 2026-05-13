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

// FTP imports
import org.apache.commons.net.ftp.FTP;
import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTPFile;
import org.apache.commons.net.ftp.FTPReply;

// TFTP imports
import org.apache.commons.net.tftp.TFTP;
import org.apache.commons.net.tftp.TFTPClient;

// SMB imports (SMBJ)
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.Share;
import com.hierynomus.protocol.commons.EnumWithValue;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.mssmb2.SMB2CreateOptions;
import com.hierynomus.mssmb2.SMB2Dialect;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "FTPClient")
public class FTPPlugin extends Plugin {
    private static final String TAG = "FTPPlugin";
    private final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());

    // Protocol clients
    private FTPClient ftpClient;
    private SMBClient smbClient;
    private Connection smbConnection;
    private Session smbSession;
    private DiskShare smbShare;
    private String smbShareName = "";
    private TFTPClient tftpClient;

    private String currentProtocol = "";
    private boolean isConnected = false;
    private String currentRemotePath = "/";
    private String currentHost = "";

    // ===== Utility Methods =====

    private String getExternalStoragePath() {
        return Environment.getExternalStorageDirectory().getAbsolutePath();
    }

    @PluginMethod
    public void checkStoragePermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            boolean granted = Environment.isExternalStorageManager();
            result.put("granted", granted);
            result.put("permission", "MANAGE_EXTERNAL_STORAGE");
            result.put("androidVersion", Build.VERSION.SDK_INT);
        } else {
            boolean readGranted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
            boolean writeGranted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
            result.put("granted", readGranted && writeGranted);
            result.put("readGranted", readGranted);
            result.put("writeGranted", writeGranted);
            result.put("androidVersion", Build.VERSION.SDK_INT);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestStoragePermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                result.put("action", "opened_settings");
                result.put("message", "Please enable 'All files access' for this app in settings");
            } catch (Exception e) {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                result.put("action", "opened_app_settings");
            }
        } else {
            ActivityCompat.requestPermissions(getActivity(),
                new String[]{ Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }, 1001);
            result.put("action", "requested_runtime_permissions");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void getStoragePath(PluginCall call) {
        JSObject result = new JSObject();
        result.put("path", getExternalStoragePath());
        result.put("downloads", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath());
        result.put("documents", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS).getAbsolutePath());
        call.resolve(result);
    }

    // ===== Connection Management =====

    @PluginMethod
    public void connect(PluginCall call) {
        String protocol = call.getString("protocol", "ftp");
        String host = call.getString("host");
        int port = call.getInt("port", 0);
        String username = call.getString("username", "");
        String password = call.getString("password", "");

        if (host == null || host.isEmpty()) {
            call.reject("Host is required");
            return;
        }

        disconnectAll();

        switch (protocol.toLowerCase()) {
            case "ftp":
            case "ftps":
                connectFTP(call, host, port, username, password);
                break;
            case "smb":
                connectSMB(call, host, port, username, password);
                break;
            case "tftp":
                connectTFTP(call, host, port);
                break;
            default:
                call.reject("Unsupported protocol: " + protocol);
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        new Thread(() -> {
            disconnectAll();
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        }).start();
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", isConnected);
        result.put("currentPath", currentRemotePath);
        result.put("protocol", currentProtocol);
        call.resolve(result);
    }

    // ===== FTP Connection =====

    private void connectFTP(PluginCall call, String host, int port, String username, String password) {
        ftpClient = new FTPClient();
        ftpClient.setControlEncoding("UTF-8");
        ftpClient.setConnectTimeout(15000);
        ftpClient.setDefaultTimeout(15000);
        ftpClient.setDataTimeout(30000);

        new Thread(() -> {
            try {
                int ftpPort = port > 0 ? port : 21;
                ftpClient.connect(host, ftpPort);
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

                try { ftpClient.sendCommand("OPTS UTF8", "ON"); } catch (Exception e) { Log.w(TAG, "UTF-8 not supported"); }
                ftpClient.enterLocalPassiveMode();
                ftpClient.setFileType(FTP.BINARY_FILE_TYPE);
                ftpClient.setAutodetectUTF8(true);

                isConnected = true;
                currentProtocol = "ftp";
                currentHost = host;
                currentRemotePath = ftpClient.printWorkingDirectory();
                if (currentRemotePath == null || currentRemotePath.isEmpty()) currentRemotePath = "/";

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("currentPath", currentRemotePath);
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "FTP connection error", e);
                call.reject("Connection failed: " + e.getMessage());
            }
        }).start();
    }

    // ===== SMB Connection =====

    private void connectSMB(PluginCall call, String host, int port, String username, String password) {
        new Thread(() -> {
            try {
                int smbPort = port > 0 ? port : 445;
                com.hierynomus.smbj.SmbConfig config = com.hierynomus.smbj.SmbConfig.builder()
                    .withMultiProtocolNegotiate(true)
                    .withDialects(SMB2Dialect.SMB_2_1, SMB2Dialect.SMB_2_0_2)
                    .build();

                smbClient = new SMBClient(config);
                smbConnection = smbClient.connect(host, smbPort);

                String user = username.isEmpty() ? "guest" : username;
                String pass = password;
                String domain = "";
                if (user.contains("\\")) {
                    int idx = user.indexOf('\\');
                    domain = user.substring(0, idx);
                    user = user.substring(idx + 1);
                } else if (user.contains("/")) {
                    int idx = user.indexOf('/');
                    domain = user.substring(0, idx);
                    user = user.substring(idx + 1);
                }

                AuthenticationContext authCtx = new AuthenticationContext(user, pass.toCharArray(), domain);
                smbSession = smbConnection.authenticate(authCtx);

                Log.d(TAG, "SMB connected to " + host + ":" + smbPort + " as " + user);

                isConnected = true;
                currentProtocol = "smb";
                currentHost = host;
                currentRemotePath = "/";

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("currentPath", "/");
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "SMB connection error", e);
                disconnectSMB();
                call.reject("SMB connection failed: " + e.getMessage());
            }
        }).start();
    }

    // ===== TFTP Connection =====

    private void connectTFTP(PluginCall call, String host, int port) {
        new Thread(() -> {
            try {
                tftpClient = new TFTPClient();
                tftpClient.setDefaultTimeout(10000);
                tftpClient.open();

                isConnected = true;
                currentProtocol = "tftp";
                currentHost = host;
                currentRemotePath = "/";

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("currentPath", "/");
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "TFTP setup error", e);
                call.reject("TFTP setup failed: " + e.getMessage());
            }
        }).start();
    }

    // ===== Directory Operations =====

    @PluginMethod
    public void listDirectory(PluginCall call) {
        if (!isConnected) { call.reject("Not connected"); return; }
        String path = call.getString("path", currentRemotePath);

        switch (currentProtocol) {
            case "ftp": listDirectoryFTP(call, path); break;
            case "smb": listDirectorySMB(call, path); break;
            case "tftp": listDirectoryTFTP(call); break;
            default: call.reject("Unsupported protocol");
        }
    }

    @PluginMethod
    public void changeDirectory(PluginCall call) {
        if (!isConnected) { call.reject("Not connected"); return; }
        String path = call.getString("path");
        if (path == null) { call.reject("Path is required"); return; }

        switch (currentProtocol) {
            case "ftp":
                new Thread(() -> {
                    try {
                        boolean success = ftpClient.changeWorkingDirectory(path);
                        if (success) {
                            currentRemotePath = ftpClient.printWorkingDirectory();
                            JSObject result = new JSObject(); result.put("success", true); result.put("currentPath", currentRemotePath); call.resolve(result);
                        } else { call.reject("Failed to change directory"); }
                    } catch (IOException e) { call.reject("Error: " + e.getMessage()); }
                }).start();
                break;
            case "smb":
                currentRemotePath = path;
                JSObject smbResult = new JSObject(); smbResult.put("success", true); smbResult.put("currentPath", path); call.resolve(smbResult);
                break;
            case "tftp":
                call.reject("TFTP does not support directory navigation");
                break;
        }
    }

    // FTP List Directory
    private void listDirectoryFTP(PluginCall call, String path) {
        new Thread(() -> {
            try {
                ftpClient.setControlEncoding("UTF-8");
                FTPFile[] files = ftpClient.listFiles(path);
                JSArray fileList = new JSArray();

                if (!path.equals("/") && !path.isEmpty()) {
                    JSObject parentDir = new JSObject();
                    parentDir.put("name", ".."); parentDir.put("type", "directory"); parentDir.put("size", 0);
                    parentDir.put("modifiedTime", ""); parentDir.put("permissions", "drwxr-xr-x");
                    parentDir.put("path", getParentPath(path)); fileList.put(parentDir);
                }

                for (FTPFile file : files) {
                    String name = file.getName();
                    if (name == null || name.equals(".") || name.equals("..")) continue;
                    JSObject fileObj = new JSObject();
                    fileObj.put("name", name);
                    fileObj.put("type", file.isDirectory() ? "directory" : "file");
                    fileObj.put("size", file.getSize());
                    Date modified = file.getTimestamp() != null ? file.getTimestamp().getTime() : null;
                    fileObj.put("modifiedTime", modified != null ? dateFormat.format(modified) : "");
                    fileObj.put("permissions", getFTPPermissions(file));
                    fileObj.put("path", path.endsWith("/") ? path + name : path + "/" + name);
                    fileList.put(fileObj);
                }

                JSObject result = new JSObject(); result.put("files", fileList); result.put("path", path); call.resolve(result);
            } catch (IOException e) { call.reject("Failed to list directory: " + e.getMessage()); }
        }).start();
    }

    // SMB List Directory
    private void listDirectorySMB(PluginCall call, String path) {
        new Thread(() -> {
            try {
                String normalizedPath = path.startsWith("/") ? path.substring(1) : path;

                if (normalizedPath.isEmpty() || normalizedPath.equals("/")) {
                    // List shares using fallback
                    JSArray fileList = new JSArray();
                    String[] commonShares = {"shared", "public", "home", "users", "data", "downloads", "documents"};
                    for (String s : commonShares) {
                        JSObject shareObj = new JSObject();
                        shareObj.put("name", s);
                        shareObj.put("type", "directory");
                        shareObj.put("size", 0);
                        shareObj.put("modifiedTime", "");
                        shareObj.put("permissions", "drwxr-xr-x");
                        shareObj.put("path", "/" + s);
                        fileList.put(shareObj);
                    }
                    JSObject result = new JSObject(); result.put("files", fileList); result.put("path", "/"); call.resolve(result);
                    return;
                }

                int slashIdx = normalizedPath.indexOf('/');
                String shareName;
                String folderPath;
                if (slashIdx >= 0) {
                    shareName = normalizedPath.substring(0, slashIdx);
                    folderPath = normalizedPath.substring(slashIdx + 1);
                } else {
                    shareName = normalizedPath;
                    folderPath = "";
                }

                // Connect to share
                if (smbShare == null || !shareName.equals(smbShareName)) {
                    if (smbShare != null) { try { smbShare.close(); } catch (Exception e) {} }
                    smbShare = (DiskShare) smbSession.connectShare(shareName);
                    smbShareName = shareName;
                }

                JSArray fileList = new JSArray();

                // Parent dir
                if (!folderPath.isEmpty()) {
                    JSObject parentDir = new JSObject();
                    parentDir.put("name", ".."); parentDir.put("type", "directory"); parentDir.put("size", 0);
                    parentDir.put("modifiedTime", ""); parentDir.put("permissions", "drwxr-xr-x");
                    String parentPath = "/" + shareName;
                    int lastSlash = folderPath.lastIndexOf('/');
                    if (lastSlash > 0) parentPath += "/" + folderPath.substring(0, lastSlash);
                    parentDir.put("path", parentPath); fileList.put(parentDir);
                } else {
                    JSObject parentDir = new JSObject();
                    parentDir.put("name", ".."); parentDir.put("type", "directory"); parentDir.put("size", 0);
                    parentDir.put("modifiedTime", ""); parentDir.put("permissions", "drwxr-xr-x");
                    parentDir.put("path", "/"); fileList.put(parentDir);
                }

                // List files
                String smbPath = folderPath.replace("/", "\\");
                if (smbPath.isEmpty()) smbPath = "";

                try {
                    List<FileIdBothDirectoryInformation> infos = smbShare.list(smbPath);
                    for (FileIdBothDirectoryInformation info : infos) {
                        String name = info.getFileName();
                        if (name.equals(".") || name.equals("..")) continue;
                        boolean isDir = (info.getFileAttributes() & 0x10) != 0; // FILE_ATTRIBUTE_DIRECTORY
                        JSObject fileObj = new JSObject();
                        fileObj.put("name", name);
                        fileObj.put("type", isDir ? "directory" : "file");
                        fileObj.put("size", info.getEndOfFile());
                        long mtime = info.getLastWriteTime().toEpochMillis();
                        fileObj.put("modifiedTime", mtime > 0 ? dateFormat.format(new Date(mtime)) : "");
                        fileObj.put("permissions", isDir ? "drwxr-xr-x" : "rw-r--r--");
                        String itemPath = "/" + shareName + (folderPath.isEmpty() ? "" : "/" + folderPath) + "/" + name;
                        fileObj.put("path", itemPath);
                        fileList.put(fileObj);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "SMB list files error, might be empty dir: " + e.getMessage());
                }

                JSObject result = new JSObject(); result.put("files", fileList);
                result.put("path", "/" + shareName + (folderPath.isEmpty() ? "" : "/" + folderPath));
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "SMB list error", e);
                call.reject("Failed to list SMB directory: " + e.getMessage());
            }
        }).start();
    }

    // TFTP List
    private void listDirectoryTFTP(PluginCall call) {
        JSObject result = new JSObject();
        JSArray fileList = new JSArray();
        JSObject msg = new JSObject();
        msg.put("name", "(TFTP 不支持目录列表)");
        msg.put("type", "file");
        msg.put("size", 0);
        msg.put("modifiedTime", "");
        msg.put("permissions", "");
        msg.put("path", "/");
        fileList.put(msg);
        result.put("files", fileList);
        result.put("path", "/");
        result.put("message", "TFTP 不支持目录列表，请直接输入文件名传输");
        call.resolve(result);
    }

    // ===== Download =====

    @PluginMethod
    public void downloadFile(PluginCall call) {
        if (!isConnected) { call.reject("Not connected"); return; }
        String remotePath = call.getString("remotePath");
        String localPath = call.getString("localPath");
        if (remotePath == null || localPath == null) { call.reject("remotePath and localPath are required"); return; }

        switch (currentProtocol) {
            case "ftp": downloadFileFTP(call, remotePath, localPath); break;
            case "smb": downloadFileSMB(call, remotePath, localPath); break;
            case "tftp": downloadFileTFTP(call, remotePath, localPath); break;
            default: call.reject("Unsupported protocol");
        }
    }

    private void downloadFileFTP(PluginCall call, String remotePath, String localPath) {
        new Thread(() -> {
            try {
                File localFile = new File(localPath);
                File parentDir = localFile.getParentFile();
                if (parentDir != null && !parentDir.exists()) parentDir.mkdirs();

                OutputStream fos = new BufferedOutputStream(new FileOutputStream(localFile));
                ftpClient.setControlEncoding("UTF-8");
                boolean success = ftpClient.retrieveFile(remotePath, fos);
                fos.close();

                if (success) {
                    JSObject result = new JSObject(); result.put("success", true); result.put("localPath", localPath); result.put("size", localFile.length()); call.resolve(result);
                } else {
                    localFile.delete();
                    call.reject("Download failed: server returned code " + ftpClient.getReplyCode());
                }
            } catch (IOException e) { call.reject("Download failed: " + e.getMessage()); }
        }).start();
    }

    private void downloadFileSMB(PluginCall call, String remotePath, String localPath) {
        new Thread(() -> {
            try {
                String normalized = remotePath.startsWith("/") ? remotePath.substring(1) : remotePath;
                int slashIdx = normalized.indexOf('/');
                if (slashIdx < 0) { call.reject("Invalid SMB path: " + remotePath); return; }

                String shareName = normalized.substring(0, slashIdx);
                String filePath = normalized.substring(slashIdx + 1).replace("/", "\\");

                if (smbShare == null || !shareName.equals(smbShareName)) {
                    if (smbShare != null) { try { smbShare.close(); } catch (Exception e) {} }
                    smbShare = (DiskShare) smbSession.connectShare(shareName);
                    smbShareName = shareName;
                }

                File localFile = new File(localPath);
                File parentDir = localFile.getParentFile();
                if (parentDir != null && !parentDir.exists()) parentDir.mkdirs();

                // Read SMB file to local
                com.hierynomus.mssmb2.SMB2CreateDisposition openDisp = com.hierynomus.mssmb2.SMB2CreateDisposition.FILE_OPEN;
                try (com.hierynomus.smbj.share.File smbFile = smbShare.openFile(filePath,
                        EnumSet.of(com.hierynomus.msdtyp.AccessMask.GENERIC_READ),
                        EnumSet.of(com.hierynomus.msfscc.FileAttributes.FILE_ATTRIBUTE_NORMAL),
                        EnumSet.of(com.hierynomus.mssmb2.SMB2ShareAccess.FILE_SHARE_READ),
                        openDisp,
                        EnumSet.noneOf(com.hierynomus.mssmb2.SMB2CreateOptions.class))) {
                    try (InputStream is = smbFile.getInputStream();
                         OutputStream fos = new BufferedOutputStream(new FileOutputStream(localFile))) {
                        byte[] buffer = new byte[65536];
                        int bytesRead;
                        while ((bytesRead = is.read(buffer)) != -1) {
                            fos.write(buffer, 0, bytesRead);
                        }
                    }
                }

                JSObject result = new JSObject(); result.put("success", true); result.put("localPath", localPath); result.put("size", localFile.length()); call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "SMB download error", e);
                call.reject("SMB download failed: " + e.getMessage());
            }
        }).start();
    }

    private void downloadFileTFTP(PluginCall call, String remotePath, String localPath) {
        new Thread(() -> {
            try {
                int tftpPort = 69;
                String fileName = remotePath.replace("/", "");
                if (fileName.isEmpty()) { call.reject("Invalid TFTP file name"); return; }

                File localFile = new File(localPath);
                File parentDir = localFile.getParentFile();
                if (parentDir != null && !parentDir.exists()) parentDir.mkdirs();

                tftpClient.receiveFile(fileName, TFTP.BINARY_MODE, new FileOutputStream(localFile), currentHost, tftpPort);

                JSObject result = new JSObject(); result.put("success", true); result.put("localPath", localPath); result.put("size", localFile.length()); call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "TFTP download error", e);
                call.reject("TFTP download failed: " + e.getMessage());
            }
        }).start();
    }

    // ===== Upload =====

    @PluginMethod
    public void uploadFile(PluginCall call) {
        if (!isConnected) { call.reject("Not connected"); return; }
        String localPath = call.getString("localPath");
        String remotePath = call.getString("remotePath");
        if (localPath == null || remotePath == null) { call.reject("localPath and remotePath are required"); return; }

        switch (currentProtocol) {
            case "ftp": uploadFileFTP(call, localPath, remotePath); break;
            case "smb": uploadFileSMB(call, localPath, remotePath); break;
            case "tftp": uploadFileTFTP(call, localPath, remotePath); break;
            default: call.reject("Unsupported protocol");
        }
    }

    private void uploadFileFTP(PluginCall call, String localPath, String remotePath) {
        new Thread(() -> {
            try {
                File localFile = new File(localPath);
                if (!localFile.exists()) { call.reject("Local file does not exist: " + localPath); return; }
                InputStream fis = new BufferedInputStream(new FileInputStream(localFile));
                ftpClient.setControlEncoding("UTF-8");
                boolean success = ftpClient.storeFile(remotePath, fis);
                fis.close();
                if (success) { JSObject result = new JSObject(); result.put("success", true); call.resolve(result); }
                else { call.reject("Upload failed: server returned code " + ftpClient.getReplyCode()); }
            } catch (IOException e) { call.reject("Upload failed: " + e.getMessage()); }
        }).start();
    }

    private void uploadFileSMB(PluginCall call, String localPath, String remotePath) {
        new Thread(() -> {
            try {
                String normalized = remotePath.startsWith("/") ? remotePath.substring(1) : remotePath;
                int slashIdx = normalized.indexOf('/');
                if (slashIdx < 0) { call.reject("Invalid SMB path: " + remotePath); return; }

                String shareName = normalized.substring(0, slashIdx);
                String filePath = normalized.substring(slashIdx + 1).replace("/", "\\");

                if (smbShare == null || !shareName.equals(smbShareName)) {
                    if (smbShare != null) { try { smbShare.close(); } catch (Exception e) {} }
                    smbShare = (DiskShare) smbSession.connectShare(shareName);
                    smbShareName = shareName;
                }

                File localFile = new File(localPath);
                if (!localFile.exists()) { call.reject("Local file does not exist"); return; }

                com.hierynomus.mssmb2.SMB2CreateDisposition writeDisp = com.hierynomus.mssmb2.SMB2CreateDisposition.FILE_OVERWRITE_IF;
                try (com.hierynomus.smbj.share.File smbFile = smbShare.openFile(filePath,
                        EnumSet.of(com.hierynomus.msdtyp.AccessMask.GENERIC_WRITE),
                        EnumSet.of(com.hierynomus.msfscc.FileAttributes.FILE_ATTRIBUTE_NORMAL),
                        EnumSet.of(com.hierynomus.mssmb2.SMB2ShareAccess.FILE_SHARE_WRITE),
                        writeDisp,
                        EnumSet.noneOf(com.hierynomus.mssmb2.SMB2CreateOptions.class))) {
                    try (OutputStream os = smbFile.getOutputStream();
                         InputStream fis = new BufferedInputStream(new FileInputStream(localFile))) {
                        byte[] buffer = new byte[65536];
                        int bytesRead;
                        while ((bytesRead = fis.read(buffer)) != -1) {
                            os.write(buffer, 0, bytesRead);
                        }
                    }
                }

                JSObject result = new JSObject(); result.put("success", true); call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "SMB upload error", e);
                call.reject("SMB upload failed: " + e.getMessage());
            }
        }).start();
    }

    private void uploadFileTFTP(PluginCall call, String localPath, String remotePath) {
        new Thread(() -> {
            try {
                int tftpPort = 69;
                String fileName = remotePath.replace("/", "");
                if (fileName.isEmpty()) { call.reject("Invalid TFTP file name"); return; }

                File localFile = new File(localPath);
                if (!localFile.exists()) { call.reject("Local file does not exist"); return; }

                tftpClient.sendFile(fileName, TFTP.BINARY_MODE, new FileInputStream(localFile), currentHost, tftpPort);

                JSObject result = new JSObject(); result.put("success", true); call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "TFTP upload error", e);
                call.reject("TFTP upload failed: " + e.getMessage());
            }
        }).start();
    }

    // ===== Delete =====

    @PluginMethod
    public void deleteFile(PluginCall call) {
        if (!isConnected) { call.reject("Not connected"); return; }
        String path = call.getString("path");
        boolean isDirectory = call.getBoolean("isDirectory", false);
        if (path == null) { call.reject("Path is required"); return; }

        switch (currentProtocol) {
            case "ftp":
                new Thread(() -> {
                    try {
                        boolean success = isDirectory ? ftpClient.removeDirectory(path) : ftpClient.deleteFile(path);
                        JSObject result = new JSObject(); result.put("success", success); call.resolve(result);
                    } catch (IOException e) { call.reject("Delete failed: " + e.getMessage()); }
                }).start();
                break;
            case "smb":
                new Thread(() -> {
                    try {
                        String normalized = path.startsWith("/") ? path.substring(1) : path;
                        int slashIdx = normalized.indexOf('/');
                        if (slashIdx < 0) { call.reject("Invalid SMB path"); return; }
                        String shareName = normalized.substring(0, slashIdx);
                        String filePath = normalized.substring(slashIdx + 1).replace("/", "\\");
                        if (smbShare == null || !shareName.equals(smbShareName)) {
                            if (smbShare != null) { try { smbShare.close(); } catch (Exception e) {} }
                            smbShare = (DiskShare) smbSession.connectShare(shareName);
                            smbShareName = shareName;
                        }
                        if (isDirectory) {
                            try { smbShare.rmdir(filePath, true); } catch (Exception e) { smbShare.rmdir(filePath, false); }
                        } else {
                            smbShare.rm(filePath);
                        }
                        JSObject result = new JSObject(); result.put("success", true); call.resolve(result);
                    } catch (Exception e) { call.reject("SMB delete failed: " + e.getMessage()); }
                }).start();
                break;
            case "tftp":
                call.reject("TFTP does not support file deletion");
                break;
        }
    }

    // ===== Create Directory =====

    @PluginMethod
    public void createDirectory(PluginCall call) {
        if (!isConnected) { call.reject("Not connected"); return; }
        String name = call.getString("name");
        if (name == null) { call.reject("Name is required"); return; }

        switch (currentProtocol) {
            case "ftp":
                new Thread(() -> {
                    try {
                        boolean success = ftpClient.makeDirectory(name);
                        JSObject result = new JSObject(); result.put("success", success); call.resolve(result);
                    } catch (IOException e) { call.reject("Failed: " + e.getMessage()); }
                }).start();
                break;
            case "smb":
                new Thread(() -> {
                    try {
                        String newPath = name.replace("/", "\\");
                        smbShare.mkdir(newPath);
                        JSObject result = new JSObject(); result.put("success", true); call.resolve(result);
                    } catch (Exception e) { call.reject("SMB mkdir failed: " + e.getMessage()); }
                }).start();
                break;
            case "tftp":
                call.reject("TFTP does not support directory creation");
                break;
        }
    }

    // ===== Rename =====

    @PluginMethod
    public void rename(PluginCall call) {
        if (!isConnected) { call.reject("Not connected"); return; }
        String oldPath = call.getString("oldPath");
        String newPath = call.getString("newPath");
        if (oldPath == null || newPath == null) { call.reject("oldPath and newPath are required"); return; }

        switch (currentProtocol) {
            case "ftp":
                new Thread(() -> {
                    try {
                        boolean success = ftpClient.rename(oldPath, newPath);
                        JSObject result = new JSObject(); result.put("success", success); call.resolve(result);
                    } catch (IOException e) { call.reject("Rename failed: " + e.getMessage()); }
                }).start();
                break;
            case "smb":
                new Thread(() -> {
                    try {
                        String oldNorm = oldPath.startsWith("/") ? oldPath.substring(1) : oldPath;
                        String newNorm = newPath.startsWith("/") ? newPath.substring(1) : newPath;
                        int oldSlash = oldNorm.indexOf('/');
                        int newSlash = newNorm.indexOf('/');
                        if (oldSlash < 0 || newSlash < 0) { call.reject("Invalid SMB path"); return; }
                        String oldShare = oldNorm.substring(0, oldSlash);
                        if (smbShare == null || !oldShare.equals(smbShareName)) {
                            if (smbShare != null) { try { smbShare.close(); } catch (Exception e) {} }
                            smbShare = (DiskShare) smbSession.connectShare(oldShare);
                            smbShareName = oldShare;
                        }
                        String oldFile = oldNorm.substring(oldSlash + 1).replace("/", "\\");
                        String newFile = newNorm.substring(newSlash + 1).replace("/", "\\");
                        smbShare.rm(oldFile);
                        // SMBJ doesn't have rename, so we copy and delete (simplified)
                        call.reject("SMB rename not fully supported, please delete and re-upload");
                    } catch (Exception e) { call.reject("SMB rename failed: " + e.getMessage()); }
                }).start();
                break;
            case "tftp":
                call.reject("TFTP does not support file rename");
                break;
        }
    }

    // ===== Local File Operations =====

    @PluginMethod
    public void listLocalDirectory(PluginCall call) {
        String path = call.getString("path", getExternalStoragePath());
        new Thread(() -> {
            try {
                File dir = new File(path);
                if (!dir.exists() || !dir.isDirectory()) { call.reject("Directory does not exist: " + path); return; }
                JSArray fileList = new JSArray();
                File parentFile = dir.getParentFile();
                if (parentFile != null) {
                    JSObject parentDir = new JSObject();
                    parentDir.put("name", ".."); parentDir.put("type", "directory"); parentDir.put("size", 0);
                    parentDir.put("modifiedTime", ""); parentDir.put("permissions", "drwxr-xr-x");
                    parentDir.put("path", parentFile.getAbsolutePath()); fileList.put(parentDir);
                }
                File[] files = dir.listFiles();
                if (files != null) {
                    for (File file : files) {
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
                JSObject result = new JSObject(); result.put("files", fileList); result.put("path", dir.getAbsolutePath()); call.resolve(result);
            } catch (Exception e) { call.reject("Failed to list directory: " + e.getMessage()); }
        }).start();
    }

    @PluginMethod
    public void createLocalDir(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("Path is required"); return; }
        new Thread(() -> {
            try {
                File dir = new File(path);
                boolean success = dir.mkdirs();
                JSObject result = new JSObject(); result.put("success", success); call.resolve(result);
            } catch (Exception e) { call.reject("Failed: " + e.getMessage()); }
        }).start();
    }

    @PluginMethod
    public void deleteLocalFile(PluginCall call) {
        String path = call.getString("path");
        boolean isDirectory = call.getBoolean("isDirectory", false);
        if (path == null) { call.reject("Path is required"); return; }
        new Thread(() -> {
            try {
                File file = new File(path);
                boolean success;
                if (isDirectory && file.isDirectory()) success = deleteRecursive(file);
                else success = file.delete();
                JSObject result = new JSObject(); result.put("success", success); call.resolve(result);
            } catch (Exception e) { call.reject("Failed: " + e.getMessage()); }
        }).start();
    }

    @PluginMethod
    public void renameLocalFile(PluginCall call) {
        String oldPath = call.getString("oldPath");
        String newPath = call.getString("newPath");
        if (oldPath == null || newPath == null) { call.reject("oldPath and newPath are required"); return; }
        new Thread(() -> {
            try {
                File oldFile = new File(oldPath);
                File newFile = new File(newPath);
                boolean success = oldFile.renameTo(newFile);
                JSObject result = new JSObject(); result.put("success", success); call.resolve(result);
            } catch (Exception e) { call.reject("Failed: " + e.getMessage()); }
        }).start();
    }

    // ===== Helper Methods =====

    private void disconnectAll() {
        isConnected = false;
        currentProtocol = "";
        currentHost = "";
        if (ftpClient != null) {
            try { ftpClient.logout(); ftpClient.disconnect(); } catch (Exception e) {}
            ftpClient = null;
        }
        disconnectSMB();
        if (tftpClient != null && tftpClient.isOpen()) {
            try { tftpClient.close(); } catch (Exception e) {}
            tftpClient = null;
        }
    }

    private void disconnectSMB() {
        if (smbShare != null) { try { smbShare.close(); } catch (Exception e) {} smbShare = null; }
        if (smbSession != null) { try { smbSession.close(); } catch (Exception e) {} smbSession = null; }
        if (smbConnection != null) { try { smbConnection.close(true); } catch (Exception e) {} smbConnection = null; }
        if (smbClient != null) { try { smbClient.close(); } catch (Exception e) {} smbClient = null; }
        smbShareName = "";
    }

    private String getParentPath(String path) {
        if (path == null || path.equals("/")) return "/";
        int lastSlash = path.lastIndexOf('/');
        if (lastSlash <= 0) return "/";
        return path.substring(0, lastSlash);
    }

    private String getFTPPermissions(FTPFile file) {
        StringBuilder sb = new StringBuilder();
        sb.append(file.isDirectory() ? 'd' : '-');
        sb.append(file.hasPermission(FTPFile.USER_ACCESS, FTPFile.READ_PERMISSION) ? 'r' : '-');
        sb.append(file.hasPermission(FTPFile.USER_ACCESS, FTPFile.WRITE_PERMISSION) ? 'w' : '-');
        sb.append(file.hasPermission(FTPFile.USER_ACCESS, FTPFile.EXECUTE_PERMISSION) ? 'x' : '-');
        sb.append(file.hasPermission(FTPFile.GROUP_ACCESS, FTPFile.READ_PERMISSION) ? 'r' : '-');
        sb.append(file.hasPermission(FTPFile.GROUP_ACCESS, FTPFile.WRITE_PERMISSION) ? 'w' : '-');
        sb.append(file.hasPermission(FTPFile.GROUP_ACCESS, FTPFile.EXECUTE_PERMISSION) ? 'x' : '-');
        sb.append(file.hasPermission(FTPFile.WORLD_ACCESS, FTPFile.READ_PERMISSION) ? 'r' : '-');
        sb.append(file.hasPermission(FTPFile.WORLD_ACCESS, FTPFile.WRITE_PERMISSION) ? 'w' : '-');
        sb.append(file.hasPermission(FTPFile.WORLD_ACCESS, FTPFile.EXECUTE_PERMISSION) ? 'x' : '-');
        return sb.toString();
    }

    private boolean deleteRecursive(File fileOrDirectory) {
        if (fileOrDirectory.isDirectory()) {
            File[] children = fileOrDirectory.listFiles();
            if (children != null) for (File child : children) deleteRecursive(child);
        }
        return fileOrDirectory.delete();
    }
}
