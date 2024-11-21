<?php
session_start();
include_once('../config/Database.php');

$connectDB = new Database();
$db = $connectDB->getConnection();

// ตรวจสอบว่าได้รับค่า mail_id มาหรือไม่
if (isset($_GET['id'])) {
    $mail_id = $_GET['id'];

    // ตรวจสอบค่า mail_id
    if (!empty($mail_id)) {
        $query = "DELETE FROM mails WHERE id = :mail_id";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':mail_id', $mail_id);

        // ลองรันคำสั่ง SQL และเช็คผลลัพธ์
        if ($stmt->execute()) {
            echo 'success';
        } else {
            // หากการลบไม่สำเร็จ แสดงข้อผิดพลาดจาก SQL
            $errorInfo = $stmt->errorInfo();
            echo 'Failed to delete mail: ' . $errorInfo[2];
        }
    } else {
        echo 'Invalid mail ID';
    }
} else {
    echo 'No mail ID provided';
}
?>
