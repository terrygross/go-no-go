package com.gonogo.marine;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private int satPx = 0, sabPx = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            satPx = bars.top;
            sabPx = bars.bottom;
            handler.postDelayed(this::injectSafeArea, 600);
            handler.postDelayed(this::injectSafeArea, 2000);
            return insets;
        });
    }

    private void injectSafeArea() {
        if (getBridge() == null || getBridge().getWebView() == null || satPx == 0) return;
        float density = getResources().getDisplayMetrics().density;
        int satCss = Math.round(satPx / density);
        int sabCss = Math.round(sabPx / density);
        String js = "document.documentElement.style.setProperty('--sat','" + satCss + "px');" +
                    "document.documentElement.style.setProperty('--sab','" + sabCss + "px');";
        getBridge().getWebView().evaluateJavascript(js, null);
    }
}
