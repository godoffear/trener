package com.godoffear.trener;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

// Копия данных в папку «Загрузки/Trener» (через MediaStore — без разрешений, файлы переживают удаление приложения)
@CapacitorPlugin(name = "Backup")
public class BackupPlugin extends Plugin {
    private static final String DIR = "Trener";

    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name"), text = call.getString("text");
        if (name == null || text == null) { call.reject("нет данных"); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { call.reject("нужен Android 10+"); return; }
        try {
            ContentResolver r = getContext().getContentResolver();
            Uri coll = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            r.delete(coll, MediaStore.Downloads.DISPLAY_NAME + "=? AND " + MediaStore.Downloads.RELATIVE_PATH + " LIKE ?",
                new String[]{name, Environment.DIRECTORY_DOWNLOADS + "/" + DIR + "%"});
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + DIR);
            Uri u = r.insert(coll, v);
            if (u == null) { call.reject("не удалось создать файл"); return; }
            try (OutputStream o = r.openOutputStream(u)) { o.write(text.getBytes("UTF-8")); }
            prune(r, coll);
            JSObject res = new JSObject();
            res.put("path", Environment.DIRECTORY_DOWNLOADS + "/" + DIR + "/" + name);
            call.resolve(res);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    // оставляем последние 7 копий
    private void prune(ContentResolver r, Uri coll) {
        List<Long> ids = new ArrayList<>();
        try (Cursor c = r.query(coll, new String[]{MediaStore.Downloads._ID},
            MediaStore.Downloads.RELATIVE_PATH + " LIKE ? AND " + MediaStore.Downloads.DISPLAY_NAME + " LIKE ?",
            new String[]{Environment.DIRECTORY_DOWNLOADS + "/" + DIR + "%", "Trener_backup_%"},
            MediaStore.Downloads.DISPLAY_NAME + " DESC")) {
            while (c != null && c.moveToNext()) ids.add(c.getLong(0));
        }
        for (int i = 7; i < ids.size(); i++) {
            try { r.delete(ContentUris.withAppendedId(coll, ids.get(i)), null, null); } catch (Exception ignored) {}
        }
    }
}
