<?php
session_start(); // เริ่มต้น session เพื่อให้สามารถเข้าถึง session variables

include_once('../config/Database.php');

// ตรวจสอบว่าผู้ใช้ล็อกอินอยู่และมีข้อมูลใน session
if (!isset($_SESSION['userid']) || !isset($_SESSION['email'])) {
    echo "Error: User not logged in.";
    exit;
}

// กำหนดอีเมลผู้ส่งจาก session
$from = trim(strtolower($_SESSION['email'])); // ตัดช่องว่างและเปลี่ยนเป็นตัวพิมพ์เล็กทั้งหมด

// ตรวจสอบว่ามีการส่งคำขอแบบ POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // รับค่าจากฟอร์มและแปลงรูปแบบอีเมล
    $to = trim(strtolower($_POST['to'])); // ตัดช่องว่างและเปลี่ยนเป็นตัวพิมพ์เล็กทั้งหมด
    $subject = $_POST['subject'];
    $message = $_POST['message'];

    // ตรวจสอบว่าผู้ใช้ไม่ได้ส่งอีเมลถึงตัวเอง
    if ($to === $from) {
        echo "Error: You cannot send an email to yourself.";
        exit;
    }

    // เชื่อมต่อฐานข้อมูล
    $connectDB = new Database();
    $db = $connectDB->getConnection();

    // ตรวจสอบว่าอีเมลผู้รับ (_to) มีอยู่ในฐานข้อมูลหรือไม่
    $query = "SELECT email FROM users WHERE email = :to";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':to', $to);
    $stmt->execute();

    // ถ้าอีเมลผู้รับไม่มีในฐานข้อมูล ให้แจ้งเตือนข้อผิดพลาด
    if ($stmt->rowCount() == 0) {
        echo "Error: The email address does not exist in the system.";
        exit;
    }

    // ถ้าอีเมลผู้รับมีในระบบ ให้บันทึกข้อมูลลงในตาราง mails
    $query = "INSERT INTO mails (_to, _from, topic, message, date) VALUES (:to, :from, :subject, :message, NOW())";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':to', $to);
    $stmt->bindParam(':from', $from);
    $stmt->bindParam(':subject', $subject);
    $stmt->bindParam(':message', $message);

    if ($stmt->execute()) {
        echo "Email sent and saved successfully.";
    } else {
        echo "Failed to send email.";
    }
}
?>
