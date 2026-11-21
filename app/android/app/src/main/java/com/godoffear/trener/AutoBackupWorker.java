package com.godoffear.trener;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONObject;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

// Ночная копия данных в GitHub (в 23:59). Берёт снимок, который приложение сохранило при работе (файл autobackup.json),
// и заливает trener/latest.json + trener/history/trener_ДАТА.json (тот же формат, что и копия из приложения).
// latest.json обновляется каждый день, даже если данные не менялись.
public class AutoBackupWorker extends Worker {
    static final String PREFS = "trener_autobackup";
    static final String SNAP = "autobackup.json";

    public AutoBackupWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = p.getString("ghToken", ""), repo = p.getString("ghRepo", "");
        if (token == null || token.isEmpty() || repo == null || repo.isEmpty()) return Result.success();
        File f = new File(ctx.getFilesDir(), SNAP);
        if (!f.exists()) { p.edit().putString("ghErr", "приложение ещё не передало данные — открой его").apply(); return Result.success(); }
        try {
            byte[] data = Files.readAllBytes(f.toPath());
            // если задачу задержало за полночь — копия относится к прошедшему дню
            Calendar cal = Calendar.getInstance();
            if (cal.get(Calendar.HOUR_OF_DAY) < 3) cal.add(Calendar.DAY_OF_MONTH, -1);
            String day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime());
            String stamp = day + " " + new SimpleDateFormat("HH:mm", Locale.US).format(new Date());
            String content = Base64.encodeToString(data, Base64.NO_WRAP);
            put(token, repo, "trener/latest.json", content, "Тренер: копия " + (getInputData().getBoolean("force", false) ? stamp : day + " 23:59"));
            put(token, repo, "trener/history/trener_" + day + ".json", content, "Тренер: копия за " + day);
            p.edit().putString("ghDay", day).putLong("ghAt", System.currentTimeMillis()).putString("ghErr", "").apply();
            return Result.success();
        } catch (Exception ex) {
            p.edit().putString("ghErr", String.valueOf(ex.getMessage())).apply();
            return getRunAttemptCount() < 8 ? Result.retry() : Result.failure();
        }
    }

    private static HttpURLConnection open(String token, String repo, String path, String method) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/" + repo + "/contents/" + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        c.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        c.setRequestProperty("User-Agent", "Trener-Android");
        return c;
    }

    private static String read(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        return b.toString("UTF-8");
    }

    private static void put(String token, String repo, String path, String content, String msg) throws Exception {
        String sha = null;
        HttpURLConnection g = open(token, repo, path, "GET");
        int gc = g.getResponseCode();
        if (gc == 200) sha = new JSONObject(read(g.getInputStream())).getString("sha");
        else if (gc != 404) throw new Exception(why(gc));
        g.disconnect();
        JSONObject body = new JSONObject();
        body.put("message", msg);
        body.put("content", content);
        if (sha != null) body.put("sha", sha);
        HttpURLConnection c = open(token, repo, path, "PUT");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        try (OutputStream os = c.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        c.disconnect();
        if (code != 200 && code != 201) throw new Exception(why(code));
    }

    private static String why(int s) {
        return s == 401 || s == 403 ? "нет доступа: проверь токен и право Contents: Read and write" : s == 404 ? "репозиторий не найден" : s == 409 || s == 422 ? "конфликт записи" : "GitHub ответил " + s;
    }
}
