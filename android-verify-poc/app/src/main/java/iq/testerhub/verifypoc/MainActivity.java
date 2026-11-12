package iq.testerhub.verifypoc;

import android.app.Activity;
import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Proof of concept: can TesterHub tell, on a real phone, whether an app is installed
 * and how long it was used today? Nothing is sent anywhere; everything stays on the device.
 */
public class MainActivity extends Activity {

    private static final int BLUE = Color.parseColor("#0551CF");
    private static final int GREEN = Color.parseColor("#08875C");
    private static final int RED = Color.parseColor("#B42842");
    private static final int INK = Color.parseColor("#0B1B3F");
    private static final int MUTED = Color.parseColor("#5B6B8C");

    private static final java.util.Set<String> BROWSERS = new java.util.HashSet<>(java.util.Arrays.asList(
            "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary",
            "com.microsoft.emmx", "org.mozilla.firefox", "com.sec.android.app.sbrowser", "com.brave.browser"));

    private TextView usageStatus;
    private Button usageButton;
    private EditText input;
    private TextView result;
    private Button openButton;
    private LinearLayout todayList;
    private String lastPackage;

    /** Per-package usage for today: foreground ms, number of opens, last open time. */
    private static final class Usage { long ms; int opens; long last; long openedAt = -1; long systemMs; long hostedMs; String hostFor; long hostStart;
        final java.util.Set<String> resumed = new java.util.HashSet<>(); }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.parseColor("#F3F6FB"));
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        int p = dp(18);
        root.setPadding(p, dp(28), p, dp(40));
        scroll.addView(root);
        setContentView(scroll);

        root.addView(text("TesterHub — فحص التثبيت والاستخدام", 21, INK, true));
        root.addView(text("نسخة تجريبية لإثبات الفكرة. كلشي يبقى على موبايلك، وماكو أي بيانات تنرسل.", 14, MUTED, false));
        root.addView(text("جهازك: " + Build.MANUFACTURER + " " + Build.MODEL
                + " · أندرويد " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")", 14, INK, false));

        LinearLayout c1 = card(root);
        c1.addView(text("١. صلاحية بيانات الاستخدام", 17, INK, true));
        usageStatus = text("", 14, MUTED, false);
        c1.addView(usageStatus);
        usageButton = button("فتح الإعدادات وتفعيل الصلاحية", BLUE);
        usageButton.setOnClickListener(v -> {
            try {
                startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            } catch (Exception e) {
                startActivity(new Intent(Settings.ACTION_SETTINGS));
            }
        });
        c1.addView(usageButton);

        LinearLayout c2 = card(root);
        c2.addView(text("٢. افحص تطبيق", 17, INK, true));
        c2.addView(text("الصق رابط Google Play أو اسم الحزمة (مثل com.whatsapp)، أو اختار من القائمة جوه.", 14, MUTED, false));
        input = new EditText(this);
        input.setHint("https://play.google.com/store/apps/details?id=…");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setTextDirection(View.TEXT_DIRECTION_LTR);
        input.setSingleLine(true);
        c2.addView(input);
        Button check = button("افحص", BLUE);
        check.setOnClickListener(v -> checkPackage(extractPackage(input.getText().toString())));
        c2.addView(check);
        result = text("", 15, INK, false);
        c2.addView(result);
        openButton = button("افتح التطبيق", GREEN);
        openButton.setVisibility(View.GONE);
        openButton.setOnClickListener(v -> {
            Intent launch = lastPackage == null ? null : getPackageManager().getLaunchIntentForPackage(lastPackage);
            if (launch != null) startActivity(launch);
        });
        c2.addView(openButton);

        LinearLayout c3 = card(root);
        c3.addView(text("٣. التطبيقات اللي استخدمتها اليوم", 17, INK, true));
        c3.addView(text("من منتصف الليل لحد هسه. اضغط على أي تطبيق حتى تفحصه.", 14, MUTED, false));
        todayList = new LinearLayout(this);
        todayList.setOrientation(LinearLayout.VERTICAL);
        c3.addView(todayList);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        boolean ok = hasUsageAccess();
        usageStatus.setText(ok
                ? "مفعّلة ✓ — نگدر نقرا دقائق الاستخدام."
                : "مو مفعّلة. فعّلها لـ «TesterHub تحقق (تجريبي)» حتى نقرا دقائق الاستخدام. فحص التثبيت يشتغل بدونها.");
        usageStatus.setTextColor(ok ? GREEN : RED);
        usageButton.setVisibility(ok ? View.GONE : View.VISIBLE);
        if (lastPackage != null) checkPackage(lastPackage);
        fillTodayList(ok);
    }

    private boolean hasUsageAccess() {
        AppOpsManager ops = getSystemService(AppOpsManager.class);
        int mode = Build.VERSION.SDK_INT >= 29
                ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getPackageName())
                : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getPackageName());
        if (mode == AppOpsManager.MODE_DEFAULT) {
            return checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    static String extractPackage(String raw) {
        String s = raw == null ? "" : raw.trim();
        if (s.isEmpty()) return "";
        try {
            if (s.startsWith("http")) {
                Uri u = Uri.parse(s);
                String id = u.getQueryParameter("id");
                if (id != null && !id.isEmpty()) return id.trim();
                List<String> seg = u.getPathSegments();
                int i = seg.indexOf("testing");
                if (i >= 0 && i + 1 < seg.size()) return seg.get(i + 1).trim();
            }
        } catch (Exception ignored) { }
        return s;
    }

    private long startOfToday() {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /** Foreground time and opens per package since midnight, from raw usage events. */
    @SuppressWarnings("deprecation")
    private Map<String, Usage> todayUsage() {
        Map<String, Usage> map = new HashMap<>();
        if (!hasUsageAccess()) return map;
        UsageStatsManager usm = getSystemService(UsageStatsManager.class);
        long now = System.currentTimeMillis();
        UsageEvents events = usm.queryEvents(startOfToday(), now);
        UsageEvents.Event e = new UsageEvents.Event();
        // Apps wrapped from a website (TWA / PWABuilder / Bubblewrap) open, then hand the screen to Chrome
        // within a second or two. Chrome's following session is credited to the app that launched it.
        String lastLaunchPkg = null; long lastLaunchTs = 0;
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            int type = e.getEventType();
            String pkg = e.getPackageName();
            Usage u = map.get(pkg);
            if (u == null) { u = new Usage(); map.put(pkg, u); }
            // Track each activity of the app separately: apps with a splash screen resume a second
            // activity before the first one pauses. The app is "in front" while any of its activities is resumed.
            String cls = e.getClassName() == null ? "" : e.getClassName();
            boolean browser = BROWSERS.contains(pkg);
            if (type == UsageEvents.Event.MOVE_TO_FOREGROUND) {          // == ACTIVITY_RESUMED
                if (u.resumed.isEmpty()) {
                    u.openedAt = e.getTimeStamp(); u.opens++;
                    if (browser && lastLaunchPkg != null && !lastLaunchPkg.equals(pkg)
                            && e.getTimeStamp() - lastLaunchTs <= 5000) {
                        u.hostFor = lastLaunchPkg; u.hostStart = e.getTimeStamp();
                    }
                }
                u.resumed.add(cls);
                u.last = e.getTimeStamp();
                if (!browser && !pkg.equals(getPackageName())) { lastLaunchPkg = pkg; lastLaunchTs = e.getTimeStamp(); }
            } else if (type == UsageEvents.Event.MOVE_TO_BACKGROUND || type == 23 /* ACTIVITY_STOPPED */) {
                if (u.resumed.remove(cls) && u.resumed.isEmpty() && u.openedAt >= 0) {
                    u.ms += e.getTimeStamp() - u.openedAt; u.openedAt = -1;
                    if (u.hostFor != null) {
                        Usage host = map.get(u.hostFor);
                        if (host != null) host.hostedMs += e.getTimeStamp() - u.hostStart;
                        u.hostFor = null;
                    }
                }
            }
        }
        for (Usage u : map.values()) {
            if (u.openedAt >= 0) { u.ms += now - u.openedAt; u.openedAt = -1; }
            if (u.hostFor != null) {
                Usage host = map.get(u.hostFor);
                if (host != null) host.hostedMs += now - u.hostStart;
                u.hostFor = null;
            }
        }
        // Cross-check with Android's own daily total for the same period.
        try {
            for (Map.Entry<String, android.app.usage.UsageStats> en
                    : usm.queryAndAggregateUsageStats(startOfToday(), now).entrySet()) {
                Usage u = map.get(en.getKey());
                if (u != null) u.systemMs = en.getValue().getTotalTimeInForeground();
            }
        } catch (Exception ignored) { }
        return map;
    }

    private void checkPackage(String pkg) {
        if (pkg.isEmpty()) { result.setText("اكتب رابط أو اسم حزمة."); return; }
        lastPackage = pkg;
        PackageManager pm = getPackageManager();
        StringBuilder out = new StringBuilder();
        boolean installed;
        try {
            PackageInfo info = pm.getPackageInfo(pkg, 0);
            ApplicationInfo ai = info.applicationInfo;
            installed = true;
            out.append("✓ منصّب: ").append(pm.getApplicationLabel(ai))
               .append("\nالحزمة: ").append(pkg)
               .append("\nالنسخة: ").append(info.versionName == null ? "—" : info.versionName);
        } catch (PackageManager.NameNotFoundException ex) {
            installed = false;
            out.append("✗ مو منصّب (أو ما عنده أيقونة بالشاشة).\nالحزمة: ").append(pkg);
        }
        if (installed) {
            if (hasUsageAccess()) {
                Usage u = todayUsage().get(pkg);
                if (u == null || (u.ms == 0 && u.opens == 0 && u.hostedMs == 0)) {
                    out.append("\n\nاليوم: ما انفتح.");
                } else {
                    out.append("\n\nاليوم: ").append(formatDuration(u.ms))
                       .append("\nحسب عداد أندرويد: ").append(formatDuration(u.systemMs))
                       .append(u.hostedMs > 0 ? "\nداخل Chrome (تطبيق ويب مغلّف): " + formatDuration(u.hostedMs) : "")
                       .append(u.hostedMs > 0 ? "\nالمجموع: " + formatDuration(u.ms + u.hostedMs) : "")
                       .append(" · انفتح ").append(u.opens).append(" مرة")
                       .append("\nآخر فتح: ").append(new SimpleDateFormat("HH:mm", Locale.US).format(new Date(u.last)));
                }
            } else {
                out.append("\n\nدقائق الاستخدام: تحتاج تفعيل الصلاحية (الخطوة ١).");
            }
        }
        result.setText(out.toString());
        result.setTextColor(installed ? INK : RED);
        openButton.setVisibility(installed && pm.getLaunchIntentForPackage(pkg) != null ? View.VISIBLE : View.GONE);
    }

    private void fillTodayList(boolean access) {
        todayList.removeAllViews();
        if (!access) {
            todayList.addView(text("تحتاج تفعيل الصلاحية أولاً.", 14, MUTED, false));
            return;
        }
        PackageManager pm = getPackageManager();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        Map<String, String> labels = new HashMap<>();
        for (ResolveInfo r : pm.queryIntentActivities(launcher, 0)) {
            labels.put(r.activityInfo.packageName, String.valueOf(r.loadLabel(pm)));
        }
        Map<String, Usage> usage = todayUsage();
        List<Map.Entry<String, Usage>> rows = new ArrayList<>();
        for (Map.Entry<String, Usage> en : usage.entrySet()) {
            if (labels.containsKey(en.getKey()) && (en.getValue().ms + en.getValue().hostedMs) > 0 && !en.getKey().equals(getPackageName())) rows.add(en);
        }
        rows.sort((a, b) -> Long.compare(b.getValue().ms + b.getValue().hostedMs, a.getValue().ms + a.getValue().hostedMs));
        if (rows.isEmpty()) {
            todayList.addView(text("ماكو استخدام مسجل اليوم لحد هسه.", 14, MUTED, false));
            return;
        }
        int n = 0;
        for (Map.Entry<String, Usage> en : rows) {
            if (n++ >= 20) break;
            String pkg = en.getKey();
            TextView row = text(labels.get(pkg) + "\n" + formatDuration(en.getValue().ms + en.getValue().hostedMs)
                    + " · " + en.getValue().opens + " مرة", 15, INK, false);
            row.setPadding(0, dp(10), 0, dp(10));
            row.setOnClickListener(v -> { input.setText(pkg); checkPackage(pkg); });
            todayList.addView(row);
        }
    }

    private static String formatDuration(long ms) {
        long s = ms / 1000;
        if (s < 60) return s + " ثانية";
        return (s / 60) + " دقيقة و" + (s % 60) + " ثانية";
    }

    // ---- tiny UI helpers ----
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.START);
        t.setTextDirection(View.TEXT_DIRECTION_ANY_RTL);
        t.setLineSpacing(0, 1.25f);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(6), 0, dp(6));
        return t;
    }

    private Button button(String s, int color) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(16);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(14));
        b.setBackground(bg);
        b.setMinHeight(dp(50));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private LinearLayout card(LinearLayout parent) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), Color.parseColor("#E3E9F4"));
        c.setBackground(bg);
        c.setPadding(dp(16), dp(12), dp(16), dp(16));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(16);
        c.setLayoutParams(lp);
        parent.addView(c);
        return c;
    }
}
