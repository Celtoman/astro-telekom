<?php
declare(strict_types=1);
try {
    require '/var/www/html/vendor/autoload.php';
    $app = require '/var/www/html/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    [$script, $storageId, $key, $file, $returned] = $argv;
    if (!preg_match('#^astro-telekom/editorial-backups/[a-f0-9]{64}\.tar\.gz$#D', $key)) throw new RuntimeException('Invalid key');
    $base = '/var/www/html/storage/app/backups/publication-retention/';
    foreach ([$file, $returned] as $path) {
        if (!str_starts_with($path, $base) || !preg_match('#^editorial-[a-zA-Z0-9_-]+/(source|returned)\.tar\.gz$#D', substr($path, strlen($base)))) throw new RuntimeException('Invalid path');
    }
    $storage = App\Models\S3Storage::findOrFail((int)$storageId);
    if ((string)$storage->endpoint !== 'https://s3.twcstorage.ru') throw new RuntimeException('Unexpected endpoint');
    $disk = $storage->filesystem();
    if (!$disk->exists($key)) {
        $stream = fopen($file, 'rb'); if ($stream === false) throw new RuntimeException('Missing source');
        try { if (!$disk->put($key, $stream, ['visibility' => 'private'])) throw new RuntimeException('Upload failed'); }
        finally { fclose($stream); }
    }
    $input = $disk->readStream($key); $output = fopen($returned, 'xb');
    if ($input === false || $output === false) throw new RuntimeException('Missing readback');
    try { if (stream_copy_to_stream($input, $output) === false) throw new RuntimeException('Readback failed'); }
    finally { if (is_resource($input)) fclose($input); if (is_resource($output)) fclose($output); }
    echo json_encode(['downloadSha256' => hash_file('sha256', $returned), 'downloadBytes' => filesize($returned)]), PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'Private editorial archive upload/readback failed'.PHP_EOL); exit(1);
}
