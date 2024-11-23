const express = require('express');
const path = require('path');
const mssql = require('mssql');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const RedisStore = require('connect-redis').default; // ใช้ .default สำหรับการสร้าง store
const { createClient } = require('redis'); // ใช้ createClient จาก redis

const app = express();
const port = process.env.PORT || 3000;

// สร้าง Redis client
const redisClient = createClient({
    socket: {
        host: '127.0.0.1',
        port: 6379,
    },
});

// เชื่อมต่อ Redis client
redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    try {
        await redisClient.connect();
        console.log('Connected to Redis');
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
    }
})();

// ตั้งค่า session ด้วย RedisStore
app.use(
    session({
        store: new RedisStore({ client: redisClient }), // กำหนด client สำหรับ RedisStore
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

// การตั้งค่า Session
app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 1 วัน
}));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Database Configuration
const dbConfig = {
    user: process.env.DB_USER || 'projectcs436',
    password: process.env.DB_PASSWORD || '.cs436team',
    server: process.env.DB_SERVER || 'prohectcs436database.database.windows.net',
    database: process.env.DB_NAME || 'ProjectCS436',
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
        console.log('Connected to SQL Server');
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

// Check Session Endpoint
app.get('/check_session', (req, res) => {
    if (req.session.user) {
        res.json({ success: true, user: req.session.user });
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized' });
    }
});

// Logout Endpoint
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Failed to destroy session:', err);
            return res.status(500).json({ success: false, message: 'Failed to logout' });
        }
        res.clearCookie('connect.sid'); // ลบ session cookie
        res.redirect('/signin'); // redirect ไปที่หน้า signin
    });
});

// Routes
app.get('/', (req, res) => res.send('Server is running'));

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
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username or password is missing' });
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
    const { username, email, password, firstName, lastName } = req.body;
    try {
        const request = new mssql.Request();
        request.input('username', mssql.NVarChar, username);
        request.input('email', mssql.NVarChar, email);

        const result = await request.query('SELECT * FROM users WHERE username = @username OR email = @email');
        if (result.recordset.length > 0) return res.status(400).json({ success: false, message: 'Username or email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        request.input('hashedPassword', mssql.NVarChar, hashedPassword);
        request.input('firstName', mssql.NVarChar, firstName);
        request.input('lastName', mssql.NVarChar, lastName);

        await request.query('INSERT INTO users (username, email, password, firstName, lastName) VALUES (@username, @email, @hashedPassword, @firstName, @lastName)');
        res.json({ success: true, message: 'Registration successful' });
    } catch (err) {
        console.error('Error during registration:', err);
        res.status(500).json({ success: false, message: 'Failed to register user' });
    }
});

app.get('/fetch_message', requireLogin, async (req, res) => {
    const email = req.session.user?.email;
    const mode = req.query.mode || 'inbox';

    try {
        const request = new mssql.Request();
        let query = '';

        if (mode === 'inbox') {
            query = `
                SELECT id, sender, subject, message, sent_at
                FROM dbo.mails
                WHERE recipient = @userEmail
                ORDER BY sent_at DESC
            `;
        } else if (mode === 'sent') {
            query = `
                SELECT id, recipient, subject, message, sent_at
                FROM dbo.mails
                WHERE sender = @userEmail
                ORDER BY sent_at DESC
            `;
        }

        request.input('userEmail', mssql.NVarChar, email);
        const result = await request.query(query);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch messages' });
    }
});

app.post('/send_email', requireLogin, async (req, res) => {
    const { recipient, subject, message } = req.body;
    const sender = req.session.user?.email;

    if (!sender || !recipient || !message) {
        return res.status(400).json({ success: false, message: 'Sender, recipient, and message are required' });
    }

    if (sender === recipient) {
        return res.status(400).json({ success: false, message: 'You cannot send a message to yourself' });
    }

    try {
        const request = new mssql.Request();

        // ตรวจสอบว่าผู้รับมีอยู่ในระบบหรือไม่
        request.input('recipient', mssql.NVarChar, recipient);
        const checkRecipient = await request.query('SELECT email FROM users WHERE email = @recipient');

        if (checkRecipient.recordset.length === 0) {
            return res.status(400).json({ success: false, message: 'Recipient email does not exist' });
        }

        // บันทึกข้อความในฐานข้อมูล
        request.input('sender', mssql.NVarChar, sender);
        request.input('subject', mssql.NVarChar, subject || '');
        request.input('message', mssql.NVarChar, message);
        request.input('sent_at', mssql.DateTime, new Date());

        await request.query(`
            INSERT INTO dbo.mails (sender, recipient, subject, message, sent_at)
            VALUES (@sender, @recipient, @subject, @message, @sent_at)
        `);

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (err) {
        console.error('Error sending email:', err);
        res.status(500).json({ success: false, message: 'Failed to send message' });
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

app.get('/check-session', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true });
    } else {
        res.json({ loggedIn: false });
    }
});

// Start Server
app.listen(port, () => console.log(`Server is running on port ${port}`));
//app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));