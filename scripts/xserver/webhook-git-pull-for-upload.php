<?php
/**
 * 【このファイルを Xserver の public_html にアップロード用】
 *
 * 手順:
 * 1. ファイルマネージャの「新規ファイル」または「アップロード」で public_html に置く。
 * 2. 名前を推測されにくいものにリネーム（例: tnk-a7k9m2x1.php）推奨。
 * 3. パネルで「編集」し、下の WEBHOOK_SECRET と REPO_DIR / PUBLIC_HTML_DIR を書き換える。
 * 4. SSH で REPO_DIR に GitHub から clone 済みであること（未作成なら先に clone）。
 * 5. GitHub Webhook: Payload URL = https://tsuioku-no-kirameki.com/リネーム後.php
 *    Content type = application/json / Secret = WEBHOOK_SECRET と同じ / push のみ。
 *
 * ★ 2026-06-08 修正: privacy.html / robots.txt / sitemap.xml 等が本番で 404 になる
 *   事故（index.html だけ配信され他のファイルが配置されない）の根治。
 *   git pull だけでは public_html にサブディレクトリ tsuioku-no-kirameki/ の中身が
 *   反映されないため、pull 成功後に rsync で tsuioku-no-kirameki/ 配下を public_html に
 *   同期する。DEPLOY 定数を 'rsync' にすると有効化。
 *
 * 安全策:
 * - rsync に --delete は付けない（public_html の既存ファイル・他サイト資産を消さないため）。
 *   過去ファイルを確実に消したい場合のみ、運用に慣れてから手動で対応すること。
 * - PUBLIC_HTML_DIR が空文字や / にならないよう実行前に検証する。
 */
declare(strict_types=1);

header('Content-Type: text/plain; charset=UTF-8');

// ========= アップロード後に必ず編集 =========
const WEBHOOK_SECRET = 'CHANGE_ME_SECRET';
/** .git がある clone 先（SSH で pwd して確認） */
const REPO_DIR = '/home/besttrust/tsuioku-no-kirameki.com/_git/tsuioku-no-kirameki.com';
/** 本番公開ディレクトリ（index.html が見える場所。SSH で pwd して確認） */
const PUBLIC_HTML_DIR = '/home/besttrust/tsuioku-no-kirameki.com/public_html';
const GIT_BIN = '/usr/bin/git';
const RSYNC_BIN = '/usr/bin/rsync';
const ALLOWED_REFS = ['refs/heads/master', 'refs/heads/main'];
/**
 * デプロイ方式:
 *   'rsync' = pull 後に REPO_DIR/tsuioku-no-kirameki/ を PUBLIC_HTML_DIR へ rsync（推奨）
 *   'none'  = git pull のみ（public_html が _git 配下を指す symlink 運用などの場合）
 */
const DEPLOY = 'rsync';
// ==========================================

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo 'Method Not Allowed';
    exit;
}

$secret = WEBHOOK_SECRET;
if ($secret === '' || $secret === 'CHANGE_ME_SECRET') {
    http_response_code(500);
    echo 'Webhook not configured: set WEBHOOK_SECRET in this file (must match GitHub Webhook Secret).';
    exit;
}

$payload = file_get_contents('php://input');
if ($payload === false || $payload === '') {
    http_response_code(400);
    echo 'Empty body';
    exit;
}

$sigHeader = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
if ($sigHeader === '' || !str_starts_with($sigHeader, 'sha256=')) {
    http_response_code(403);
    echo 'Missing signature';
    exit;
}

$expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);
if (!hash_equals($expected, $sigHeader)) {
    http_response_code(403);
    echo 'Invalid signature';
    exit;
}

$data = json_decode($payload, true);
if (!is_array($data)) {
    http_response_code(400);
    echo 'Invalid JSON';
    exit;
}

$event = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? '';
if ($event === 'ping') {
    http_response_code(200);
    echo 'pong';
    exit;
}

if ($event !== 'push') {
    http_response_code(200);
    echo 'Ignored event: ' . $event;
    exit;
}

$ref = $data['ref'] ?? '';
if (!in_array($ref, ALLOWED_REFS, true)) {
    http_response_code(200);
    echo 'Ignored ref: ' . $ref;
    exit;
}

if (!is_dir(REPO_DIR) || !is_dir(REPO_DIR . '/.git')) {
    http_response_code(500);
    echo 'REPO_DIR is not a git repository';
    exit;
}

$git = escapeshellcmd(GIT_BIN);
$dir = escapeshellarg(REPO_DIR);
$cmd = "cd {$dir} && {$git} pull --ff-only 2>&1";

$output = [];
$code = 0;
exec($cmd, $output, $code);
$out = implode("\n", $output);

if ($code !== 0) {
    http_response_code(500);
    echo "git pull failed ({$code})\n" . $out;
    exit;
}

$extra = '';
if (DEPLOY === 'rsync') {
    // 公開ディレクトリの安全検証（空 / ルート / 短すぎるパスを拒否）
    $pub = PUBLIC_HTML_DIR;
    if ($pub === '' || $pub === '/' || strlen($pub) < 10 || !is_dir($pub)) {
        http_response_code(500);
        echo "git ok but PUBLIC_HTML_DIR is unsafe or missing: '{$pub}'\n" . $out;
        exit;
    }

    // 末尾スラッシュ重要: src 末尾 / で「中身」を、dst へ同期。--delete は付けない。
    $src = rtrim(REPO_DIR, '/') . '/tsuioku-no-kirameki/';
    $dst = rtrim($pub, '/') . '/';
    if (!is_dir($src)) {
        http_response_code(500);
        echo "git ok but source dir missing: '{$src}'\n" . $out;
        exit;
    }

    $rsync = escapeshellcmd(RSYNC_BIN);
    $rsyncCmd = "{$rsync} -a " . escapeshellarg($src) . ' ' . escapeshellarg($dst) . ' 2>&1';

    $output2 = [];
    $code2 = 0;
    exec($rsyncCmd, $output2, $code2);
    $extra = "\n--- rsync ---\n" . implode("\n", $output2);
    if ($code2 !== 0) {
        http_response_code(500);
        echo "git ok but rsync failed ({$code2})\n" . $out . $extra;
        exit;
    }
}

http_response_code(200);
echo "OK\n" . $out . $extra;
