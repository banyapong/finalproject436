<?php
include_once('../config/Database.php');
session_start();

$connectDB = new Database();
$db = $connectDB->getConnection();

if (isset($_GET['id']) && isset($_SESSION['userid'])) {
    $mailId = $_GET['id'];
    $userEmail = $_SESSION['email'];

    // ดึงรายละเอียดอีเมลตาม id
    $query = "SELECT _from, topic, message, date FROM mails WHERE id = :mailId AND _to = :userEmail";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':mailId', $mailId);
    $stmt->bindParam(':userEmail', $userEmail);
    $stmt->execute();

    $mail = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($mail) {
        echo '<div class="mail-details">';
        echo '<h3>From: ' . htmlspecialchars($mail['_from']) . '</h3>';
        echo '<p><strong>Topic:</strong> ' . htmlspecialchars($mail['topic']) . '</p>';
        echo '<p><strong>Date:</strong> ' . htmlspecialchars($mail['date']) . '</p>';
        echo '<p><strong>Message:</strong><br>' . nl2br(htmlspecialchars($mail['message'])) . '</p>';
        echo '</div>';
    } else {
        echo '<p>Error: Mail not found or you do not have permission to view it.</p>';
    }
} else {
    echo "Error: Invalid request.";
}
?>
