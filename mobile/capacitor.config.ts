import type { CapacitorConfig } from '@capacitor/cli';

/**
 * server.url リモート読込型の Capacitor 設定(web-ios-android キットの金型に準拠)。
 *
 * 公開済みのスマホ版 https://app.tsuioku-no-kirameki.com/phone(開始画面)をネイティブシェルで表示する。
 * 値の出どころは mobile/app.config.json。構造は金型と同じ・手書きが唯一の真実の源。
 *
 * 黒画面回避の金型(_docs/CAPACITOR-GOLDEN-RULES.md)に準拠:
 *   - 独自 VC / UIWindow / AppDelegate 注入はしない(原則1「作り分けない」)
 *   - App-Bound Domains 許可(ios.scheme / limitsNavigationsToAppBoundDomains:false /
 *     server.iosScheme:'https' / allowNavigation)でリモート読込を成立させる
 *   - 起動フラッシュ対策は backgroundColor + patch-ios-launch-dark.mjs の2点だけ
 *
 * 背景色 #FFF7EC は DESIGN.md の bg(暖かいクリーム)=スプラッシュ画像の地色と同じ。ARGB8 = #FFF7ECFF。
 * アプリだけの機能(通知・振動・共有)は @capacitor/local-notifications・haptics・share。
 *   使う側は app/live-view-native.js(window.Capacitor があるときだけ動く)。
 */
const config: CapacitorConfig = {
  appId: 'com.kimito.link.tsuioku',
  appName: '追憶のきらめき',
  webDir: 'dist/public',
  backgroundColor: '#FFF7ECFF',
  ios: {
    contentInset: 'always',
    scheme: 'tsuioku',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#FFF7ECFF',
  },
  android: {
    backgroundColor: '#FFF7ECFF',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      launchFadeOutDuration: 300,
      backgroundColor: '#FFF7ECFF',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    LocalNotifications: {
      iconColor: '#F06AA0',
    },
  },
  server: {
    url: 'https://app.tsuioku-no-kirameki.com/phone',
    cleartext: false,
    hostname: 'app.tsuioku-no-kirameki.com',
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['app.tsuioku-no-kirameki.com', '*.tsuioku-no-kirameki.com'],
  },
};

export default config;
