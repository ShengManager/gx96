<?php

include "../Config.php";
require __DIR__ . '/../../vendor/autoload.php';

use Aws\S3\S3Client;
use Aws\Exception\AwsException;

header('Content-Type: application/json');

// S3 配置
$bucket = 'gt96-image';
$region = 'ap-southeast-1';
$endpoint = 'https://s3.ap-southeast-1.cloudwave-s3.com';
$accessKey = '33L24Z91PL6ILU9YO7P5';
$secretKey = 'V654TaFnQ35uziAfTW1gbtusAgLLzzDkzbJAgPAV';

// 初始化 S3 客户端
$s3 = new S3Client([
    'version' => 'latest',
    'region'  => $region,
    'endpoint' => $endpoint,
    'use_path_style_endpoint' => true,
    'credentials' => [
        'key' => $accessKey,
        'secret' => $secretKey,
    ],
]);

// $_POST['SecrtKey'] = "00000000000000000000";
// $_POST['ImgID'] = "1";

// 检查请求方法
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    exit(json_encode(['Status' => false, 'Message' => '只支持POST请求']));
}


// 检查是否有SecrtKey参数
if (!isset($_POST['SecrtKey'])) {
    exit($NoData);
}

$SecrtKey = $_POST['SecrtKey'];
$CompanyID = CheckCompany($SecrtKey);

// 检查是否有ImgID参数
if (!isset($_POST['ImgID'])) {
    http_response_code(400);
    echo json_encode(['error' => '缺少图片ID参数']);
    exit;
}

$ImgID = $_POST['ImgID'];

// 从数据库获取图片信息
$result = $conn->query("SELECT `Img` FROM `Image` WHERE `CompanyID` = $CompanyID AND `ID` = $ImgID");

if ($result && $result->num_rows > 0) {
    $row = $result->fetch_assoc();
    $imageKey = $row['Img'];

    try {
        // 生成预签名URL，有效期为1小时
        $cmd = $s3->getCommand('GetObject', [
            'Bucket' => $bucket,
            'Key'    => $imageKey
        ]);

        $request = $s3->createPresignedRequest($cmd, '+1 hour');
        $imageUrl = (string) $request->getUri();

        echo json_encode([
            'Status' => true,
            'URL' => $imageUrl
        ]);
    } catch (AwsException $e) {
        http_response_code(500);
        echo json_encode([
            'Status' => false,
            'error' => '生成图片URL失败',
            'message' => $e->getMessage()
        ]);
    }
} else {
    http_response_code(404);
    echo json_encode([
        'Status' => false,
        'error' => '未找到图片'
    ]);
}
exit;
