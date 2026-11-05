# GO / NO-GO release shrinking rules (R8).
# Capacitor talks to the web view through reflection and @JavascriptInterface, so its
# bridge, plugins and annotations must survive shrinking.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { @com.getcapacitor.annotation.PluginMethod public <methods>; }
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keep class com.gonogo.marine.** { *; }
-dontwarn com.getcapacitor.**
# Readable stack traces in Play Console crash reports.
-renamesourcefileattribute SourceFile
