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
// $_POST['ImgID'] = "14";

// 检查请求方法
// if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
//     http_response_code(405);
//     echo json_encode(['error' => '只支持POST请求']);
//     exit;
// }


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
        // 从S3删除图片

        $s3->deleteObject([
            'Bucket' => $bucket,
            'Key'    => $imageKey
        ]);


        // 从数据库删除图片记录
        $deleteStmt = $conn->prepare("
            DELETE FROM Image 
            WHERE ID = ? AND CompanyID = ?
        ");
        $deleteStmt->bind_param("ii", $ImgID, $CompanyID);
        $deleteStmt->execute();
        $deleteStmt->close();

        echo json_encode([
            'Status' => true,
            'Message' => '图片删除成功'
        ]);

        // 记录日志
        error_log(sprintf(
            "[Image Delete] CompanyID: %d, ImageID: %d, S3Key: %s",
            $CompanyID,
            $ImgID,
            $imageKey
        ));
    } catch (AwsException $e) {
        http_response_code(500);
        echo json_encode([
            'Status' => false,
            'error' => '删除图片失败',
            'message' => $e->getMessage()
        ]);

        // 记录错误日志
        error_log(sprintf(
            "[Image Delete Error] CompanyID: %d, ImageID: %d, Error: %s",
            $CompanyID,
            $ImgID,
            $e->getMessage()
        ));
    }
} else {
    http_response_code(404);
    echo json_encode([
        'Status' => false,
        'error' => '未找到图片'
    ]);
}
exit;
