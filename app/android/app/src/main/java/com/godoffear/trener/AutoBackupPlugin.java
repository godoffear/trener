package com.godoffear.trener;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Calendar;
import java.util.concurrent.TimeUnit;

// Мост для ночной копии: приложение передаёт снимок данных и настройки GitHub, плагин ставит расписание на 23:59.
@CapacitorPlugin(name = "AutoBackup")
public class AutoBackupPlugin extends Plugin {
    private static final String WORK = "trener-autobackup";

    // Сохраняет снимок (в файл) и настройки GitHub, ставит расписание
    @PluginMethod
    public void setSnapshot(PluginCall call) {
        try {
            Context ctx = getContext();
            String text = call.getString("text");
            if (text != null && !text.isEmpty()) {
                File tmp = new File(ctx.getFilesDir(), AutoBackupWorker.SNAP + ".tmp");
                Files.write(tmp.toPath(), text.getBytes(StandardCharsets.UTF_8));
                if (!tmp.renameTo(new File(ctx.getFilesDir(), AutoBackupWorker.SNAP))) throw new Exception("не записался снимок");
            }
            SharedPreferences.Editor e = ctx.getSharedPreferences(AutoBackupWorker.PREFS, Context.MODE_PRIVATE).edit();
            e.putString("ghRepo", call.getString("repo", "")).putString("ghToken", call.getString("token", ""));
            e.apply();
            schedule(ctx);
            call.resolve();
        } catch (Exception ex) {
            call.reject(String.valueOf(ex.getMessage()));
        }
    }

    // Статус последней ночной копии
    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(AutoBackupWorker.PREFS, Context.MODE_PRIVATE);
        JSObject r = new JSObject();
        r.put("day", p.getString("ghDay", ""));
        r.put("at", p.getLong("ghAt", 0));
        r.put("err", p.getString("ghErr", ""));
        call.resolve(r);
    }

    // Принудительный запуск (для проверки)
    @PluginMethod
    public void runNow(PluginCall call) {
        Data d = new Data.Builder().putBoolean("force", true).build();
        WorkManager.getInstance(getContext()).enqueue(new OneTimeWorkRequest.Builder(AutoBackupWorker.class)
            .setInputData(d).setConstraints(net()).build());
        call.resolve();
    }

    private static Constraints net() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    // Раз в 24 часа, первый запуск — в ближайшие 23:59 по времени телефона
    static void schedule(Context ctx) {
        Calendar now = Calendar.getInstance(), t = Calendar.getInstance();
        t.set(Calendar.HOUR_OF_DAY, 23); t.set(Calendar.MINUTE, 59); t.set(Calendar.SECOND, 0); t.set(Calendar.MILLISECOND, 0);
        if (!t.after(now)) t.add(Calendar.DAY_OF_MONTH, 1);
        long delay = t.getTimeInMillis() - now.getTimeInMillis();
        PeriodicWorkRequest w = new PeriodicWorkRequest.Builder(AutoBackupWorker.class, 24, TimeUnit.HOURS)
            .setInitialDelay(delay, TimeUnit.MILLISECONDS).setConstraints(net()).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, w);
    }
}
