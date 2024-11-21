<?php
session_start();
include_once('../config/Database.php');

$connectDB = new Database();
$db = $connectDB->getConnection();

if (isset($_SESSION['userid'])) {
    $userEmail = $_SESSION['email'];
    
    // ดึงข้อมูลเฉพาะหัวข้อของอีเมล
    $query = "SELECT _from, topic, date, id FROM mails WHERE _to = :userEmail ORDER BY date DESC";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':userEmail', $userEmail);
    $stmt->execute();

    $mails = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!empty($mails)) {
        foreach ($mails as $mail) {
            echo '<div class="message-item" onclick="showMailContent(' . htmlspecialchars($mail['id']) . ')">';
            echo '<div class="icon-circle"></div>';
            echo '<div class="message-content">';
            echo '<h3>From: ' . htmlspecialchars($mail['_from']) . '</h3>';
            echo '<p><strong>Topic:</strong> ' . htmlspecialchars($mail['topic']) . '</p>';
            echo '<p><strong>Date:</strong> ' . htmlspecialchars($mail['date']) . '</p>';
            echo '</div>';
            echo '<button class="delete-button" onclick="deleteMail(' . htmlspecialchars($mail['id']) . ')">🗑️</button>';
            echo '</div>';
        }
    } else {
        echo '<p>No messages found.</p>';
    }
} else {
    echo "Error: User not logged in.";
}
?>
