<?php
/**
 * 【このファイルを Xserver の public_html にアップロード用】
 *
 * 手順:
 * 1. ファイルマネージャの「新規ファイル」または「アップロード」で public_html に置く。
 * 2. 名前を推測されにくいものにリネーム（例: tnk-a7k9m2x1.php）推奨。
 * 3. パネルで「編集」し、下の WEBHOOK_SECRET と REPO_DIR（必要なら POST_PULL_CMD）を書き換える。
 * 4. SSH で REPO_DIR に GitHub から clone 済みであること（未作成なら先に clone）。
 * 5. GitHub Webhook: Payload URL = https://tsuioku-no-kirameki.com/リネーム後.php
 *    Content type = application/json / Secret = WEBHOOK_SECRET と同じ / push のみ。
 *
 * POST_PULL_CMD: LP はリポジトリ内 tsuioku-no-kirameki/ にあるため、pull だけでは public_html が変わらない
 * 場合は rsync の行を有効化（パスは SSH で pwd して合わせる）。--delete は注意して使うこと。
 */
declare(strict_types=1);

header('Content-Type: text/plain; charset=UTF-8');

// ========= アップロード後に必ず編集 =========
const WEBHOOK_SECRET = 'CHANGE_ME_SECRET';
/** .git がある clone 先（SSH で pwd して確認） */
const REPO_DIR = '/home/besttrust/tsuioku-no-kirameki.com/_git/tsuioku-no-kirameki.com';
const GIT_BIN = '/usr/bin/git';
const ALLOWED_REFS = ['refs/heads/master', 'refs/heads/main'];
/**
 * null = git pull のみ。
 * 公開ディレクトリへ LP を反映する例（パス要確認）:
 * 'rsync -a /home/besttrust/tsuioku-no-kirameki.com/_git/tsuioku-no-kirameki.com/tsuioku-no-kirameki/ /home/besttrust/tsuioku-no-kirameki.com/public_html/'
 * ※ --delete は既存ファイルを消すので、運用に慣れるまでは付けないことを推奨。
 */
const POST_PULL_CMD = null;
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
if (POST_PULL_CMD !== null && POST_PULL_CMD !== '') {
    $output2 = [];
    $code2 = 0;
    exec(POST_PULL_CMD . ' 2>&1', $output2, $code2);
    $extra = "\n--- post ---\n" . implode("\n", $output2);
    if ($code2 !== 0) {
        http_response_code(500);
        echo "git ok but post command failed ({$code2})\n" . $out . $extra;
        exit;
    }
}

http_response_code(200);
echo "OK\n" . $out . $extra;
