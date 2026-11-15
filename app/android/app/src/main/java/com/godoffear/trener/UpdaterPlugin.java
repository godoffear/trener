package com.godoffear.trener;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Обновление «изнутри»: скачиваем APK из релиза GitHub с прогрессом и запускаем системную установку
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("плохая ссылка"); return; }
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists()) dir.mkdirs();
                File out = new File(dir, "Trener-update.apk");
                if (out.exists()) out.delete();
                String cur = url;
                for (int i = 0; i < 6; i++) {   // GitHub отдаёт файл через редиректы
                    c = (HttpURLConnection) new URL(cur).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000); c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { cur = c.getHeaderField("Location"); c.disconnect(); continue; }
                    if (code != 200) throw new Exception("сервер ответил " + code);
                    break;
                }
                long total = c.getContentLengthLong(), got = 0; int lastPct = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n); got += n;
                        int pct = total > 0 ? (int) (got * 100 / total) : -1;
                        if (pct != lastPct) { lastPct = pct; JSObject p = new JSObject(); p.put("pct", pct); p.put("mb", Math.round(got / 104857.6) / 10.0); notifyListeners("progress", p); }
                    }
                }
                if (total > 0 && got != total) throw new Exception("файл скачался не полностью");
                JSObject res = new JSObject(); res.put("path", out.getAbsolutePath());
                call.resolve(res);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            } finally { if (c != null) c.disconnect(); }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("нет файла"); return; }
        if (!getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            call.reject("perm");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", new File(path));
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
}
