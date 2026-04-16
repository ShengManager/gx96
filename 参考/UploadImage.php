<?php

include "../Config.php";
require __DIR__ . '/../../vendor/autoload.php';

use Aws\S3\S3Client;
use Aws\Exception\AwsException;

header('Content-Type: application/json');

// 检查是否有SecrtKey参数
if (!isset($_POST['SecrtKey'])) {
    exit($NoData);
}

$SecrtKey = $_POST['SecrtKey'];
$Path = $_POST['Path'];
$CompanyID = CheckCompany($SecrtKey);





// 只在提交表单时处理上传
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // S3 设定
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

    // 检查上传
    if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'ERROR1：上传失败或无文件']);
        exit;
    }

    // 获取文件信息
    $file = $_FILES['image'];
    $fileType = $file['type'];
    $fileSize = $file['size'];

    // 检查文件类型
    // $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    // if (!in_array($fileType, $allowedTypes)) {
    //     http_response_code(400);
    //     echo json_encode(['error' => 'ERROR2：不支持的文件类型，只允许上传jpg、jpeg、png、gif和webp格式的图片']);
    //     exit;
    // }

    // 检查文件大小（限制为5MB）
    if ($fileSize > 5 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => 'ERROR3：文件大小超过限制，最大允许5MB']);
        exit;
    }

    // 上传处理
    $tmpFile = $file['tmp_name'];
    $originalName = basename($file['name']);
    $fileExt = pathinfo($originalName, PATHINFO_EXTENSION);
    $key = $Path . '/' . uniqid() . '_' . time() . '.' . $fileExt;



    try {
        $result = $s3->putObject([
            'Bucket' => $bucket,
            'Key'    => $key,
            'SourceFile' => $tmpFile,
            'ACL'    => 'public-read',
            'ContentType' => $fileType
        ]);
        // $url = $result['ObjectURL'];

        $conn->query("INSERT INTO `Image`(`CompanyID`, `Img`) VALUES ($CompanyID,'$key');");
        $ImgID = $conn->insert_id;
        echo json_encode([
            'Status' => true,
            'ID' => $ImgID
        ]);
    } catch (AwsException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => '上传失败',
            'message' => $e->getMessage()
        ]);
    }
    exit;
}

// 设置上传目录和URL基础路径

// $uploadDir = $telegramImg . 'Messages/';  // 实际文件系统路径
// $baseUrl = $telegramImg_Url . 'Messages/';    // 图片访问的URL基础路径

// 确保目录存在
// if (!file_exists($uploadDir)) {
//     mkdir($uploadDir, 0755, true);
// }

// // 获取文件信息
// $file = $_FILES['image'];
// $fileName = $file['name'];
// $fileTmpName = $file['tmp_name'];
// $fileSize = $file['size'];
// $fileError = $file['error'];
// $fileType = $file['type'];

// // 获取文件扩展名
// $fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

// // 允许的图片类型
// $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// // 检查文件类型
// if (!in_array($fileExt, $allowed)) {
//     exit(json_encode([
//         'Status' => false,
//         'Message' => '不支持的文件类型，只允许上传jpg、jpeg、png、gif和webp格式的图片'
//     ]));
// }

// // 检查文件大小（限制为5MB）
// if ($fileSize > 5 * 1024 * 1024) {
//     exit(json_encode([
//         'Status' => false,
//         'Message' => '文件大小超过限制，最大允许5MB'
//     ]));
// }

// // 生成唯一的文件名（基于时间戳和随机数）
// $newFileName = 'img_' . $CompanyID . '_' . date('YmdHis') . '_' . mt_rand(1000, 9999) . '.' . $fileExt;
// $uploadPath = $uploadDir . $newFileName;
// // echo $uploadPath;
// // 移动上传的文件
// if (move_uploaded_file($fileTmpName, $uploadPath)) {
//     // 设置文件权限
//     chmod($uploadPath, 0644);

//     // 返回图片URL
//     $imageUrl = $baseUrl . $newFileName;

//     echo json_encode([
//         'Status' => true,
//         'Message' => '图片上传成功',
//         'URL' => $imageUrl
//     ]);
// } else {
//     echo json_encode([
//         'Status' => false,
//         'Message' => '图片上传失败，请稍后再试'
//     ]);
// }
