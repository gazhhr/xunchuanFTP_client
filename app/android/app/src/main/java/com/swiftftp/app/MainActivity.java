package com.swiftftp.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.swiftftp.app.plugin.FTPPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SwiftFTP";
    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FTPPlugin.class);
        super.onCreate(savedInstanceState);

        requestStoragePermissions();
    }

    /**
     * Request storage permissions based on Android version.
     * - Android 10 and below: request READ/WRITE_EXTERNAL_STORAGE
     * - Android 11+ (API 30+): request MANAGE_EXTERNAL_STORAGE (All Files Access)
     */
    public void requestStoragePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ - need MANAGE_EXTERNAL_STORAGE
            if (!Environment.isExternalStorageManager()) {
                Log.i(TAG, "Requesting MANAGE_EXTERNAL_STORAGE permission");
                Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                startActivity(intent);
            } else {
                Log.i(TAG, "MANAGE_EXTERNAL_STORAGE already granted");
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Android 6 to 10 - request runtime permissions
            boolean needRead = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED;
            boolean needWrite = ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED;

            if (needRead || needWrite) {
                Log.i(TAG, "Requesting READ/WRITE_EXTERNAL_STORAGE permissions");
                ActivityCompat.requestPermissions(this,
                        new String[]{
                                Manifest.permission.READ_EXTERNAL_STORAGE,
                                Manifest.permission.WRITE_EXTERNAL_STORAGE
                        },
                        PERMISSION_REQUEST_CODE);
            } else {
                Log.i(TAG, "READ/WRITE_EXTERNAL_STORAGE already granted");
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            for (int i = 0; i < permissions.length; i++) {
                Log.i(TAG, "Permission " + permissions[i] + " result: " + grantResults[i]);
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-check permission when user returns from settings
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            boolean granted = Environment.isExternalStorageManager();
            Log.i(TAG, "onResume - isExternalStorageManager: " + granted);
        }
    }
}
