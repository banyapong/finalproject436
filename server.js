const express = require('express');
const path = require('path');
const mssql = require('mssql');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
// const { BlobServiceClient } = require('@azure/storage-blob');
const http = require('http');

//const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const app = express();
const port = process.env.PORT || 3000;

// let blobServiceClient; // Define globally
// let containerClient;  // Define globally

// เก็บ socket ของผู้ใช้
const userSockets = {};

// Azure Blob Storage Configuration
// try {
//     if (!AZURE_STORAGE_CONNECTION_STRING) {
//         throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
//     }

//     blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
//     containerClient = blobServiceClient.getContainerClient("profile-images");
//     console.log("Azure Blob Storage connected successfully.");
// } catch (error) {
//     console.error("Error initializing BlobServiceClient:", error.message);
// }

// ตั้งค่า session โดยใช้ default memory store ของ express-session
app.use(
    session({
        secret: 'your-secret-key', // กำหนด secret key สำหรับ session
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false, // ใช้ true หากใช้ HTTPS
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // อายุ session 1 วัน
        },
    })
);

// การตั้งค่า Body Parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
});

// Database Configuration
const dbConfig = {
    user: process.env.DB_USER || 'cdex',
    password: process.env.DB_PASSWORD || 'codex-1234',
    server: process.env.DB_SERVER || 'cdex.database.windows.net',
    database: process.env.DB_NAME || 'final',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 30000, // เพิ่ม requestTimeout เพื่อป้องกันการ timeout เร็วเกินไป
    },
}; 

// Function to Connect to Database with Retry Logic
const connectWithRetry = async () => {
    try {
        await mssql.connect(dbConfig);
    } catch (err) {
        console.error('SQL Server connection failed. Retrying in 5 seconds...', err);
        setTimeout(connectWithRetry, 5000); // Retry after 5 seconds
    }
};

connectWithRetry(); // เรียกใช้การเชื่อมต่อฐานข้อมูลพร้อม Retry Logic
// Connect to Database
mssql.connect(dbConfig)
    .then(() => console.log("Connected to SQL Server"))
    .catch(err => console.error('SQL Server connection failed', err));

const checkNotLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        // หากล็อกอินอยู่ ให้ Redirect ไปหน้า Mail
        return res.redirect('/mail');
    }
    next();
};
const checkLoggedIn = (req, res, next) => {
    if (!req.session || !req.session.user) {
        // หากไม่ได้ล็อกอิน ให้ Redirect ไปหน้า Signin
        return res.redirect('/signin');
    }
    next();
};
    
// Middleware for Login Check
function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Please log in.' });
    }
    next();
}

app.get('/check_session', async (req, res) => {
    console.log('Checking session:', req.session);
    if (req.session && req.session.user) {
        res.json({ success: true, user: req.session.user });
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized' });
    }
});

app.get('/health', async (req, res) => {
    try {
        const pool = await mssql.connect(dbConfig);
        res.status(200).send('Server is healthy');
        pool.close();
    } catch (err) {
        res.status(500).send('Database connection failed');
    }
});

// Logout Endpoint
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ success: false, message: 'Failed to logout' });
        }
        console.log('Session destroyed successfully.');
        res.clearCookie('connect.sid');
        res.redirect('/signin');
    });
});

// Routes
app.get('/', (req, res) => {
    res.send('Server is running');
    // res.send('Azure Blob Storage setup completed.');
});

app.get('/signin', checkNotLoggedIn, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signin.html')); // ใช้ path แบบ relative ไปยังโฟลเดอร์ public
});

app.get('/signup', checkNotLoggedIn, (req, res) => {
    res.sendFile(path.join(__dirname,'public', 'signup.html'));
});

app.get('/mail', checkLoggedIn, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mail.html'));
});

// Sign In
app.post('/signin', async (req, res) => {
    let { username, password } = req.body;

    // ลบช่องว่างก่อน-หลัง และตรวจสอบว่ามีข้อมูล
    username = username?.trim();
    password = password?.trim();

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username or password cannot be empty or contain only spaces',
        });
    }

    try {
        const request = new mssql.Request();
        request.input('username', mssql.NVarChar, username);
        const result = await request.query('SELECT * FROM users WHERE username = @username');

        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const user = result.recordset[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            req.session.user = {
                id: user.id,
                username: user.username,
                email: user.email,
            };

            res.json({ success: true, message: 'Login successful' });
        } else {
            res.status(401).json({ success: false, message: 'Incorrect password' });
        }
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Sign Up
app.post('/signup', async (req, res) => {
    try {
        const { username, email, password, firstName, lastName, phone } = req.body;

        if (!username || !email || !password || !firstName || !lastName || !phone) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        // Validation
        const noSpaceRegex = /^[^\s]+$/; // ห้ามมี space ทั้งหมด
        const nameRegex = /^[a-zA-Z]+$/; // ตัวอักษรภาษาอังกฤษเท่านั้น
        const phoneRegex = /^[0-9]{10}$/; // หมายเลขโทรศัพท์ 10 หลัก
        const emailRegex = /^[a-zA-Z0-9._%+-]+@(gmail\.com|bumail\.net|bu\.ac\.th)$/; // Email domains

        if (!noSpaceRegex.test(username)) {
            return res.status(400).json({ success: false, message: 'Username cannot contain spaces.' });
        }

        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Email is not valid.' });
        }

        if (!noSpaceRegex.test(password)) {
            return res.status(400).json({ success: false, message: 'Password cannot contain spaces.' });
        }

        if (!nameRegex.test(firstName)) {
            return res.status(400).json({ success: false, message: 'First Name can only contain letters.' });
        }

        if (!nameRegex.test(lastName)) {
            return res.status(400).json({ success: false, message: 'Last Name can only contain letters.' });
        }

        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
        }

        // ตรวจสอบว่า Username หรือ Email ซ้ำหรือไม่
        const request = new mssql.Request();
        request.input('username', mssql.NVarChar, username);
        request.input('email', mssql.NVarChar, email);

        const result = await request.query('SELECT * FROM users WHERE username = @username OR email = @email');

        if (result.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'Username or email already exists.' });
        }

        // Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert User
        request.input('hashedPassword', mssql.NVarChar, hashedPassword);
        request.input('firstName', mssql.NVarChar, firstName);
        request.input('lastName', mssql.NVarChar, lastName);
        request.input('phone', mssql.NVarChar, phone);

        await request.query(`
            INSERT INTO users (username, email, password, firstName, lastName, phone)
            VALUES (@username, @email, @hashedPassword, @firstName, @lastName, @phone)
        `);

        res.status(200).json({ success: true, message: 'Registration successful' });
    } catch (err) {
        console.error('Error during registration:', err);
        res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
});

app.get('/fetch_message', requireLogin, async (req, res) => {
    const email = req.session.user?.email;
    const mode = req.query.mode || 'inbox';
    console.log(`[FETCH MESSAGE] User: ${email}, Mode: ${mode}`);

    try {
        const request = new mssql.Request();
        const query = mode === 'inbox' 
            ? `SELECT id, sender, subject, message, sent_at FROM dbo.mails WHERE recipient = @userEmail ORDER BY sent_at DESC`
            : `SELECT id, recipient, subject, message, sent_at FROM dbo.mails WHERE sender = @userEmail ORDER BY sent_at DESC`;

        request.input('userEmail', mssql.NVarChar, email);
        const result = await request.query(query);
        console.log(`[FETCH MESSAGE] Messages fetched:`, result.recordset);

        res.json(result.recordset);
    } catch (err) {
        console.error('[FETCH MESSAGE] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
    }
});

// API สำหรับส่งอีเมล
app.post('/send_email', requireLogin, async (req, res) => {
    const { recipient, subject, message } = req.body;
    const sender = req.session.user?.email;

    console.log(`[SEND EMAIL] Sender: ${sender}, Recipient: ${recipient}, Subject: ${subject}, Message: ${message}`); // Log input data

    if (!sender || !recipient || !message) {
        console.warn('[SEND EMAIL] Missing fields'); // Log warning
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        const request = new mssql.Request();
        const recipientCheck = await request.input('recipient', mssql.NVarChar, recipient)
            .query('SELECT email FROM dbo.users WHERE email = @recipient');

        if (recipientCheck.recordset.length === 0) {
            console.warn(`[SEND EMAIL] Recipient not found: ${recipient}`); // Log missing recipient
            return res.status(404).json({ success: false, message: 'Recipient not found.' });
        }

        request.input('sender', mssql.NVarChar, sender);
        request.input('subject', mssql.NVarChar, subject || '');
        request.input('message', mssql.NVarChar, message);
        request.input('sent_at', mssql.DateTime, new Date());

        await request.query(`INSERT INTO dbo.mails (sender, recipient, subject, message, sent_at) VALUES (@sender, @recipient, @subject, @message, @sent_at)`);
        console.log('[SEND EMAIL] Message sent successfully'); // Log success
        res.json({ success: true, message: 'Message sent successfully.' });
    } catch (err) {
        console.error('[SEND EMAIL] Error:', err); // Log errors
        res.status(500).json({ success: false, message: 'Failed to send email.' });
    }
});

app.post('/delete_mail', requireLogin, async (req, res) => {
    const { id } = req.body; // รับ ID ของอีเมลที่ต้องการลบจาก Body ของคำขอ

    if (!id) {
        return res.status(400).json({ success: false, message: 'Message ID is required' });
    }

    try {
        const request = new mssql.Request();
        await request.input('id', mssql.Int, id).query('DELETE FROM dbo.mails WHERE id = @id');

        res.json({ success: true, message: 'Message deleted successfully' });
    } catch (err) {
        console.error('Error deleting message:', err);
        res.status(500).json({ success: false, message: 'Failed to delete message' });
    }
});

// Endpoint สำหรับอัปโหลดรูปภาพ
// app.post('/upload_profile', upload.single('profile_image'), async (req, res) => {
//     console.log("POST /upload_profile triggered");

//     if (!req.file) {
//         console.error("No file uploaded in request");
//         return res.status(400).json({ success: false, message: "No file uploaded" });
//     }

//     try {
//         const blobName = `${Date.now()}-${path.basename(req.file.originalname)}`;
//         const blockBlobClient = containerClient.getBlockBlobClient(blobName);

//         console.log("Uploading image to Blob Storage:", blobName);

//         await blockBlobClient.uploadData(req.file.buffer, {
//             blobHTTPHeaders: { blobContentType: req.file.mimetype },
//         });

//         const profileImageUrl = blockBlobClient.url;
//         console.log("Uploaded Profile Image URL:", profileImageUrl);

//         const userId = req.session.user.id;

//         const request = new mssql.Request();
//         await request.input('profile_image_url', mssql.NVarChar, profileImageUrl)
//             .input('user_id', mssql.Int, userId)
//             .query('UPDATE dbo.users SET profile_image_url = @profile_image_url WHERE id = @user_id');

//         req.session.user.profile_image_url = profileImageUrl;
//         console.log("Session updated with new profile image URL:", req.session.user);

//         res.json({ success: true, message: "Profile image updated", url: profileImageUrl });
//     } catch (err) {
//         console.error("Error uploading profile image:", err);
//         res.status(500).json({ success: false, message: "Failed to upload profile image" });
//     }
// });

app.get('/get_user', requireLogin, async (req, res) => {
    try {
        const request = new mssql.Request();
        const result = await request
            .input('id', mssql.Int, req.session.user.id)
            .query(`
                SELECT id, username, email, firstname, lastname, phone
                FROM dbo.users 
                WHERE id = @id
            `);

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    firstname: user.firstname || "N/A",
                    lastname: user.lastname || "N/A",
                    phone: user.phone,
                    // profile_image_url: user.profile_image_url || 'https://profilecs436.blob.core.windows.net/profile-images/default-profile.png.webp',
                },
            });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (err) {
        console.error('Error fetching user data:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch user data' });
    }
});

app.post('/mark_as_read', requireLogin, async (req, res) => {
    const { id, mode } = req.body;
    console.log(`[MARK AS READ] ID: ${id}, Mode: ${mode}`); // Log input data

    if (!id || !mode) {
        console.warn('[MARK AS READ] Missing ID or Mode'); // Log warning
        return res.status(400).json({ success: false, message: 'Message ID and mode are required.' });
    }

    try {
        const column = mode === 'inbox' ? 'is_read_by_recipient' : 'is_read_by_sender';
        const request = new mssql.Request();

        await request.input('id', mssql.Int, id).query(`UPDATE dbo.mails SET ${column} = 1 WHERE id = @id`);
        console.log(`[MARK AS READ] Message ID ${id} marked as read.`); // Log success
        res.json({ success: true, message: 'Message marked as read.' });
    } catch (err) {
        console.error('[MARK AS READ] Error:', err); // Log errors
        res.status(500).json({ success: false, message: 'Failed to mark message as read.' });
    }
});



// Start Server
app.listen(port, () => console.log(`Server is running on port ${port}`));
//app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));