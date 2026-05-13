# 迅传FTP Android APK 开发全流程总结

## 项目概述

一款基于 Web 技术栈（React + TypeScript + Capacitor）开发的 Android FTP 客户端应用，支持本地文件管理、FTP 连接、文件上传下载等功能。

---

## 一、技术栈选择

| 层面 | 技术 | 用途 |
|------|------|------|
| 前端框架 | React 19 + TypeScript | UI 组件开发 |
| 构建工具 | Vite 7.x | 打包构建 |
| 样式 | Tailwind CSS 3.4 | 样式设计 |
| UI 组件 | shadcn/ui | 基础组件库 |
| 状态管理 | Zustand | 全局状态 |
| 跨平台桥 | Capacitor 7.x | 将 Web 打包为原生 App |
| 原生开发 | Java + Apache Commons Net | Android 原生 FTP 功能 |
| 图标 | Lucide React | 图标库 |
| 持久化 | @capacitor/preferences | 连接配置持久化 |
| 文件系统 | 自定义 Android Plugin | 绕过 Scoped Storage 限制 |

---

## 二、开发环境搭建

### 2.1 Node.js 前端环境

```bash
# 1. 初始化项目（使用提供的脚手架脚本）
bash scripts/init-webapp.sh "应用名称"
cd /mnt/agents/output/app

# 2. 安装 Capacitor 核心库
npm install @capacitor/core @capacitor/cli

# 3. 安装 Android 平台
npm install @capacitor/android
npx cap init "应用名称" com.example.appname --web-dir dist
npx cap add android

# 4. 安装其他 Capacitor 插件
npm install @capacitor/preferences
```

### 2.2 Android 开发环境

需要三个核心组件：**JDK**、**Android SDK**、**Gradle**。

#### JDK 21

```bash
# 下载 OpenJDK 21
curl -sL "https://download.java.net/openjdk/jdk21/ri/openjdk-21+35_linux-x64_bin.tar.gz" \
  -o /tmp/openjdk21.tar.gz
tar -xzf /tmp/openjdk21.tar.gz -C /tmp/
# JDK 路径: /tmp/jdk-21
```

#### Android SDK

```bash
# 1. 下载命令行工具
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk/cmdline-tools
curl -sL \
  "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
  -o cmdline-tools.zip
unzip -q cmdline-tools.zip
mv cmdline-tools latest

# 2. 安装必要组件
export ANDROID_HOME=$HOME/android-sdk
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME \
  "platforms;android-34" \
  "platforms;android-35" \
  "build-tools;34.0.0" \
  "platform-tools"

# 3. 接受许可证
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME --licenses
```

#### Gradle 8.x

```bash
# Gradle 会由 Android 项目自动下载
# 如果网络问题，可手动放置：
mkdir -p ~/.gradle/wrapper/dists/gradle-8.11.1-all/2q51dik5anp2vp2aiir1fq62l
cd ~/.gradle/wrapper/dists/gradle-8.11.1-all/2q51dik5anp2vp2aiir1fq62l
curl -sL "https://services.gradle.org/distributions/gradle-8.11.1-all.zip" \
  -o gradle-8.11.1-all.zip
unzip -q gradle-8.11.1-all.zip
```

### 2.3 环境变量

```bash
export ANDROID_HOME=$HOME/android-sdk
export JAVA_HOME=/tmp/jdk-21
# Gradle 通过 wrapper 自动调用，无需 PATH
```

---

## 三、项目结构

```
app/
├── src/
│   ├── store/
│   │   └── realFTPStore.ts          # Zustand 全局状态管理
│   ├── components/
│   │   ├── ConnectionModal.tsx      # FTP 连接弹窗
│   │   ├── FileList.tsx             # 文件列表（支持列宽拖拽）
│   │   ├── TransferQueue.tsx        # 传输队列面板
│   │   └── ActionSheet.tsx          # 文件操作底部菜单
│   ├── types/
│   │   └── index.ts                 # TypeScript 类型定义
│   ├── App.tsx                      # 主应用组件
│   └── main.tsx                     # 入口文件
├── android/                         # Capacitor 生成的 Android 项目
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml      # 应用权限声明
│   │   ├── java/com/swiftftp/app/
│   │   │   ├── MainActivity.java    # 主 Activity + 权限申请
│   │   │   └── plugin/
│   │   │       └── FTPPlugin.java  # 自定义 Capacitor 插件
│   │   └── res/mipmap-*/           # 应用图标
│   └── app/build.gradle             # 依赖配置
├── dist/                            # Web 构建产物
└── capacitor.config.ts              # Capacitor 配置
```

---

## 四、关键开发经验

### 4.1 Web 与原生通信（Capacitor Plugin 开发）

Capacitor 插件是 Web 代码调用原生 Android 功能的桥梁。

**注册插件（前端）**：
```typescript
import { registerPlugin } from '@capacitor/core';

const FTPClientNative = registerPlugin<{
  connect(options: { host: string; port: number; ... }): Promise<{ success: boolean }>;
  downloadFile(options: { remotePath: string; localPath: string }): Promise<{ success: boolean }>;
  // ... 其他方法
}>('FTPClient');
```

**实现插件（Java）**：
```java
package com.swiftftp.app.plugin;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FTPClient")
public class FTPPlugin extends Plugin {
    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host");
        // 异步操作必须在后台线程执行
        new Thread(() -> {
            try {
                // 执行网络操作...
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);  // 成功返回
            } catch (Exception e) {
                call.reject("Error: " + e.getMessage());  // 失败返回
            }
        }).start();
    }
}
```

**在 MainActivity 中注册**：
```java
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FTPPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

### 4.2 Android 存储权限（Scoped Storage 陷阱）

**Android 10（API 29）** 引入 Scoped Storage，应用默认只能访问自己的沙盒目录。

**Android 11（API 30）** 起，`requestLegacyExternalStorage` 属性完全失效。

**解决方案 - 申请 MANAGE_EXTERNAL_STORAGE 权限**：

1. AndroidManifest.xml 中声明：
```xml
<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
```

2. MainActivity.java 中动态申请：
```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
    if (!Environment.isExternalStorageManager()) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
        startActivity(intent);
    }
}
```

3. 使用原生 Java File API 直接读取文件（绕过 Capacitor Filesystem 的限制）：
```java
File[] files = new File(path).listFiles();
for (File file : files) {
    // 直接读取文件名、大小、修改时间
}
```

**经验**：不要依赖 Capacitor 的 Filesystem 插件来读取设备上的所有文件。在 Android 11+ 上，它几乎无法工作。自定义 Java 插件是唯一可靠的方案。

### 4.3 持久化存储

使用 `@capacitor/preferences` 替代 localStorage（在 WebView 中不可靠）：

```typescript
import { Preferences } from '@capacitor/preferences';

// 保存
await Preferences.set({ key: 'connections', value: JSON.stringify(configs) });

// 读取
const { value } = await Preferences.get({ key: 'connections' });
```

### 4.4 FTP 中文乱码

FTP 协议默认使用 ISO-8859-1 编码，中文文件名会乱码。

**解决方案**：
```java
// 连接前设置 UTF-8
ftpClient.setControlEncoding("UTF-8");

// 登录后启用 UTF-8 模式
ftpClient.sendCommand("OPTS UTF8", "ON");

// 自动检测 UTF-8
ftpClient.setAutodetectUTF8(true);
```

### 4.5 串行传输队列

FTP 协议是单连接协议，不支持并发传输多个文件。如果同时启动多个传输，后面的会失败。

**解决方案 - 串行队列**：
```typescript
// 使用 while 循环依次处理队列中的任务
processTransferQueue: async () => {
    if (get().isTransferring) return;
    set({ isTransferring: true });
    
    while (true) {
        const nextTask = tasks.find(t => t.status === 'queued');
        if (!nextTask) break;
        
        // 执行当前任务
        await performTransfer(nextTask);
        
        // 完成后自动处理下一个
    }
    
    set({ isTransferring: false });
}
```

### 4.6 打包 APK 的完整命令

```bash
# 1. 构建 Web 项目
cd /mnt/agents/output/app
npm run build

# 2. 同步 Capacitor 资源到 Android
npx cap sync android

# 3. 构建 APK
export ANDROID_HOME=$HOME/android-sdk
export JAVA_HOME=/tmp/jdk-21
cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
bash ./gradlew assembleDebug --no-daemon

# 4. APK 输出位置
# app/build/outputs/apk/debug/app-debug.apk
```

### 4.7 调试技巧

**常见问题排查**：
- **构建报错 "No toolchains found"**：SDK 平台版本不匹配，安装对应版本的 `platforms;android-XX`
- **构建报错 "SDK location not found"**：确保 `local.properties` 文件中有 `sdk.dir=...`
- **权限申请不弹出**：Android 11+ 需要 `MANAGE_EXTERNAL_STORAGE`，不能用普通运行时权限
- **文件读取为空**：检查 `Environment.isExternalStorageManager()` 是否返回 true
- **FTP 连接超时**：检查网络权限、端口、被动模式设置
- **中文乱码**：确保设置了 `ftpClient.setControlEncoding("UTF-8")`

---

## 五、核心踩坑记录

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 安装后找不到图标 | 只生成了 xxxhdpi 图标 | 用 Python PIL 生成全尺寸图标（mdpi 到 xxxhdpi） |
| 本地文件读取为空 | Android 11+ Scoped Storage | 申请 MANAGE_EXTERNAL_STORAGE + 自定义 Java 文件读取 |
| 传输多个文件后面的失败 | FTP 不支持并发传输 | 实现串行传输队列 |
| 中文文件名乱码 | FTP 默认 ISO-8859-1 编码 | 设置 UTF-8 编码 + OPTS UTF8 ON |
| 连接配置无法保存 | 没持久化到本地存储 | 使用 @capacitor/preferences |
| 权限申请弹窗不显示 | 用了错误的权限类型 | Android 11+ 需跳转系统设置页面 |
| 下载文件找不到 | 路径使用了相对路径 | 使用绝对路径 `/storage/emulated/0/...` |
| Kotlin 依赖冲突 | cordova-android-plugins 引入不同版本 | 在 build.gradle 中 exclude 冲突的 kotlin-stdlib |

---

## 六、后续 APK 开发 checklist

```
环境准备
  [ ] 安装 JDK 17/21
  [ ] 安装 Android SDK（platforms + build-tools + platform-tools）
  [ ] 接受 SDK 许可证
  [ ] 确认 Gradle wrapper 可用

项目初始化
  [ ] 使用 init-webapp.sh 创建前端项目
  [ ] 安装 @capacitor/core @capacitor/cli
  [ ] 添加 Android 平台
  [ ] 安装需要的 Capacitor 插件
  [ ] 如果需要原生功能，编写自定义 Plugin

开发阶段
  [ ] 前端代码开发（npm run dev 调试）
  [ ] 自定义 Plugin 开发（Java/Kotlin）
  [ ] 在 MainActivity 中注册 Plugin
  [ ] 申请必要的 Android 权限

权限申请（Android 11+ 特别注意）
  [ ] AndroidManifest.xml 声明 MANAGE_EXTERNAL_STORAGE
  [ ] MainActivity 中动态检测 + 跳转设置页面
  [ ] 所有文件操作使用原生 Java File API

打包
  [ ] npm run build
  [ ] npx cap sync android
  [ ] bash ./gradlew assembleDebug
  [ ] 测试 APK（安装 + 功能验证）

发布
  [ ] bash ./gradlew assembleRelease
  [ ] 签名 APK
```

---

## 七、文件清单

| 文件 | 说明 |
|------|------|
| `/mnt/agents/output/design/design.md` | 设计 PRD 文档 |
| `/mnt/agents/output/app/` | 完整项目源码 |
| `/mnt/agents/output/迅传FTP-v7.apk` | 最终 APK |
| `/mnt/agents/output/vibeapk.md` | 本总结文档 |
