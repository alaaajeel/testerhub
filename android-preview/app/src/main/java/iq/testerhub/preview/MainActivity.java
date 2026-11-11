package iq.testerhub.preview;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";
    private static final String FIRESTORE_ROOT = "https://firestore.googleapis.com/v1/projects/testhubiq-c7711/databases/(default)/documents";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView webView;
    private JSONObject session;
    private Button submit;
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(9, 46, 115));
        getWindow().setNavigationBarColor(Color.rgb(244, 248, 255));
        showLogin();
    }

    private int dp(float value) {
        return (int) (getResources().getDisplayMetrics().density * value + 0.5f);
    }

    private TextView label(String text, int size, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private EditText input(String hint, int mode) {
        EditText edit = new EditText(this);
        edit.setSingleLine(true);
        edit.setHint(hint);
        edit.setTextColor(Color.rgb(24, 55, 105));
        edit.setTextSize(16);
        edit.setInputType(mode);
        edit.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), Color.rgb(212, 225, 245));
        edit.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(54));
        lp.topMargin = dp(12);
        edit.setLayoutParams(lp);
        return edit;
    }

    private void showLogin() {
        webView = null;
        session = null;
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(242, 247, 255));
        LinearLayout content = new LinearLayout(this);
        content.setGravity(Gravity.CENTER);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(30), dp(24), dp(28));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -1));

        TextView mark = label("✓", 54, Color.WHITE);
        GradientDrawable markBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[]{Color.rgb(12, 184, 143), Color.rgb(23, 92, 188)});
        markBg.setCornerRadius(dp(24));
        mark.setBackground(markBg);
        LinearLayout.LayoutParams markLp = new LinearLayout.LayoutParams(dp(94), dp(94));
        markLp.bottomMargin = dp(20);
        content.addView(mark, markLp);

        TextView title = label("TesterHub V2", 28, Color.rgb(13, 58, 122));
        title.setTypeface(null, Typeface.BOLD);
        content.addView(title);
        TextView sub = label("نسخة Android تجريبية مستقلة", 16, Color.rgb(69, 104, 148));
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(-1, -2);
        subLp.bottomMargin = dp(20);
        content.addView(sub, subLp);

        TextView info = label("سجل بنفس حسابك الحالي في TesterHub.\nيُعرض حسابك وتطبيقاتك واختباراتك للقراءة فقط.", 14, Color.rgb(70, 102, 140));
        content.addView(info);
        EditText email = input("البريد الإلكتروني", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = input("كلمة المرور", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        content.addView(email);
        content.addView(password);

        submit = new Button(this);
        submit.setText("تسجيل الدخول بالحساب الحالي");
        submit.setTextSize(15);
        submit.setTextColor(Color.WHITE);
        submit.setAllCaps(false);
        GradientDrawable buttonBg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[]{Color.rgb(16, 80, 174), Color.rgb(26, 115, 206)});
        buttonBg.setCornerRadius(dp(15));
        submit.setBackground(buttonBg);
        LinearLayout.LayoutParams buttonLp = new LinearLayout.LayoutParams(-1, dp(54));
        buttonLp.topMargin = dp(19);
        content.addView(submit, buttonLp);
        status = label("ما ننشئ حساباً جديداً، ولا نغيّر دورك أو بياناتك على Firebase.", 12, Color.rgb(101, 126, 154));
        LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(-1, -2);
        statusLp.topMargin = dp(16);
        content.addView(status, statusLp);
        submit.setOnClickListener(v -> signIn(email.getText().toString().trim(), password.getText().toString()));
        setContentView(scroll);
    }

    private void signIn(String email, String password) {
        if (!email.contains("@") || password.isEmpty()) {
            status.setText("اكتب البريد وكلمة المرور الصحيحين.");
            return;
        }
        submit.setEnabled(false);
        status.setText("جاري التحقق من الحساب وقراءة البيانات المسموح بها...");
        executor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("email", email);
                body.put("password", password);
                body.put("returnSecureToken", true);
                JSONObject auth = request("POST", AUTH_URL + BuildConfig.AUTH_API_KEY, body, null);
                String idToken = auth.getString("idToken");
                String uid = auth.getString("localId");
                JSONObject profile = request("GET", FIRESTORE_ROOT + "/users/" + uid, null, idToken);
                JSONObject fields = profile.optJSONObject("fields");
                JSONObject user = new JSONObject();
                user.put("uid", uid);
                user.put("email", auth.optString("email", email));
                user.put("name", field(fields, "name", "مستخدم TesterHub"));
                user.put("legacyRole", field(fields, "role", "unknown"));
                JSONObject data = new JSONObject();
                data.put("user", user);
                data.put("ownedProjects", queryUserCollection("projects", "ownerUid", uid, idToken));
                data.put("assignedTests", queryUserCollection("assignments", "testerUid", uid, idToken));
                data.put("mode", "readonly");
                main.post(() -> showApp(data));
            } catch (Exception error) {
                main.post(() -> {
                    if (submit != null) submit.setEnabled(true);
                    if (status != null) status.setText("تعذّر تسجيل الدخول أو تحميل الحساب. تأكد من بيانات الدخول والاتصال ثم أعد المحاولة.");
                });
            }
        });
    }

    private static String field(JSONObject fields, String key, String fallback) {
        if (fields == null) return fallback;
        JSONObject value = fields.optJSONObject(key);
        return value == null ? fallback : value.optString("stringValue", fallback);
    }

    private JSONArray queryUserCollection(String collection, String fieldName, String uid, String token) {
        JSONArray result = new JSONArray();
        try {
            JSONObject condition = new JSONObject()
                .put("fieldFilter", new JSONObject()
                    .put("field", new JSONObject().put("fieldPath", fieldName))
                    .put("op", "EQUAL")
                    .put("value", new JSONObject().put("stringValue", uid)));
            JSONObject query = new JSONObject()
                .put("structuredQuery", new JSONObject()
                    .put("from", new JSONArray().put(new JSONObject().put("collectionId", collection)))
                    .put("where", condition)
                    .put("limit", 30));
            JSONArray records = requestArray("POST", FIRESTORE_ROOT + ":runQuery", query, token);
            for (int i = 0; i < records.length() && result.length() < 30; i++) {
                JSONObject document = records.optJSONObject(i);
                if (document == null) continue;
                JSONObject item = document.optJSONObject("document");
                if (item == null) continue;
                JSONObject fields = item.optJSONObject("fields");
                if (fields == null) continue;
                JSONObject visible = new JSONObject();
                visible.put("name", field(fields, "name", "تطبيق غير مسمى"));
                visible.put("status", field(fields, "status", "غير محدد"));
                visible.put("projectId", field(fields, "projectId", ""));
                visible.put("link", field(fields, "link", ""));
                result.put(visible);
            }
        } catch (Exception ignored) {
            // Some roles or older indexes cannot query this collection; never broaden permissions.
        }
        return result;
    }

    private static JSONObject request(String method, String url, JSONObject body, String bearer) throws Exception {
        String response = requestText(method, url, body, bearer);
        return new JSONObject(response);
    }

    private static JSONArray requestArray(String method, String url, JSONObject body, String bearer) throws Exception {
        return new JSONArray(requestText(method, url, body, bearer));
    }

    private static String requestText(String method, String uri, JSONObject body, String bearer) throws Exception {
        URL parsed = new URL(uri);
        if (!"https".equals(parsed.getProtocol())) throw new SecurityException("TLS required");
        String host = parsed.getHost();
        if (!"identitytoolkit.googleapis.com".equals(host) && !"firestore.googleapis.com".equals(host))
            throw new SecurityException("Host not allowed");
        HttpURLConnection conn = (HttpURLConnection) parsed.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(12000);
        conn.setInstanceFollowRedirects(false);
        conn.setRequestProperty("Accept", "application/json");
        if (bearer != null) conn.setRequestProperty("Authorization", "Bearer " + bearer);
        try {
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int code = conn.getResponseCode();
            if (code < 200 || code > 299) throw new SecurityException("HTTP " + code);
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int total = 0, length;
                while ((length = in.read(buffer)) != -1) {
                    total += length;
                    if (total > 512000) throw new SecurityException("Response too large");
                    out.write(buffer, 0, length);
                }
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            conn.disconnect();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showApp(JSONObject data) {
        session = data;
        WebView local = new WebView(this);
        webView = local;
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        local.getSettings().setJavaScriptEnabled(true);
        local.getSettings().setDomStorageEnabled(true);
        local.getSettings().setAllowFileAccess(false);
        local.getSettings().setAllowContentAccess(false);
        local.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        local.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        local.addJavascriptInterface(new ExternalLinks(), "TesterHubAndroid");
        local.setWebChromeClient(new WebChromeClient());
        local.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && LOCAL_HOST.equals(uri.getHost())) return false;
                openExternal(uri == null ? "" : uri.toString());
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (session != null && url.startsWith("https://" + LOCAL_HOST + "/assets/index.html")) {
                    view.evaluateJavascript("window.testerhubNativeSession(" + session.toString() + ");", null);
                }
            }
        });
        setContentView(local);
        local.loadUrl("https://" + LOCAL_HOST + "/assets/index.html");
    }

    private void openExternal(String raw) {
        try {
            Uri url = Uri.parse(raw);
            if (!"https".equals(url.getScheme())) return;
            String host = url.getHost();
            if (!"play.google.com".equals(host) && !"groups.google.com".equals(host)) return;
            startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (Exception ignored) {
            main.post(() -> Toast.makeText(this, "تعذّر فتح الرابط", Toast.LENGTH_SHORT).show());
        }
    }

    private final class ExternalLinks {
        @JavascriptInterface public void open(String url) {
            main.post(() -> openExternal(url));
        }
        @JavascriptInterface public void logout() {
            main.post(() -> {
                if (webView != null) {
                    webView.stopLoading();
                    webView.removeJavascriptInterface("TesterHubAndroid");
                    webView.destroy();
                }
                showLogin();
            });
        }
    }

    @Override public void onBackPressed() {
        if (webView != null) {
            new android.app.AlertDialog.Builder(this)
                .setMessage("تريد ترجع إلى شاشة تسجيل الدخول؟")
                .setNegativeButton("إلغاء", (d, w) -> {})
                .setPositiveButton("تسجيل خروج", (d, w) -> {
                    webView.destroy();
                    showLogin();
                })
                .show();
        } else {
            super.onBackPressed();
        }
    }
    @Override protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
