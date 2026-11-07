<?php
// Runs only inside the existing Coolify container. Credentials never leave its model.
declare(strict_types=1);
try {
    require '/var/www/html/vendor/autoload.php';
    $app = require '/var/www/html/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    [$script, $storageId, $key, $file, $restored, $mode] = $argv;
    if (!in_array($mode, ['read-only', 'create-or-read'], true)) throw new RuntimeException('Invalid archive mode');
    if (!preg_match('#^astro-telekom/publications/[a-f0-9]{64}/[a-f0-9]{64}\.tar\.gz$#D', $key)) throw new RuntimeException('Invalid archive key');
    $base = '/var/www/html/storage/app/backups/publication-retention/';
    foreach ([$file, $restored] as $path) {
        if (!str_starts_with($path, $base) || !preg_match('#^artifact-[a-zA-Z0-9_-]+/(source|returned)\.tar\.gz$#D', substr($path, strlen($base)))) throw new RuntimeException('Invalid archive path');
    }
    $storage = App\Models\S3Storage::findOrFail((int)$storageId);
    $known = [
        1 => ['ffbq2trtdlvxv71d5z864bi5', 'https://s3.twcstorage.ru', '15f49e2d-baac-4c88-b252-5fff386e83ea'],
        2 => ['38iyukf4l2e6ewxau3sfnlf5', 'https://s3.eu-central-003.backblazeb2.com', 'astrotelekom'],
    ];
    if (!isset($known[(int)$storageId]) || !$storage->is_usable
        || [(string)$storage->uuid, (string)$storage->endpoint, (string)$storage->bucket] !== $known[(int)$storageId]) throw new RuntimeException('Unexpected archive destination');
    $disk = $storage->filesystem();
    // Never overwrite an existing off-server archive. A retry downloads and verifies the original.
    if (!$disk->exists($key)) {
        if ($mode === 'read-only') throw new RuntimeException('Previously verified archive is missing');
        $stream = fopen($file, 'rb');
        if ($stream === false) throw new RuntimeException('Archive input unavailable');
        try { if (!$disk->put($key, $stream, ['visibility' => 'private'])) throw new RuntimeException('Archive upload rejected'); }
        finally { fclose($stream); }
    }
    $in = $disk->readStream($key);
    $out = fopen($restored, 'xb');
    if ($in === false || $out === false) throw new RuntimeException('Archive readback unavailable');
    try { if (stream_copy_to_stream($in, $out) === false) throw new RuntimeException('Archive download failed'); }
    finally { if (is_resource($in)) fclose($in); if (is_resource($out)) fclose($out); }
    echo json_encode(['downloadSha256' => hash_file('sha256', $restored), 'downloadBytes' => filesize($restored)]), PHP_EOL;
} catch (Throwable $e) {
    // SDK exceptions may contain signed URLs; do not print them or credentials.
    fwrite(STDERR, 'Off-server archive upload/readback failed ('.get_class($e).')'.PHP_EOL);
    exit(1);
}
