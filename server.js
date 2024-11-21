const express = require('express');
const path = require('path');
const mssql = require('mssql');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

// การตั้งค่า Body Parser เพื่อดึงข้อมูลจาก request body
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ตั้งค่า static files สำหรับไฟล์ CSS/JS
app.use(express.static(path.join(__dirname, 'public')));

// การเชื่อมต่อกับฐานข้อมูล
const dbConfig = {
    user: 'projectcs436',
    password: '.cs436team',
    server: 'prohectcs436database.database.windows.net',
    database: 'ProjectCS436',
    options: {
        encrypt: true,  // ต้องการการเข้ารหัสเชื่อมต่อ
        trustServerCertificate: true  // สำหรับการเชื่อมต่อที่ปลอดภัย
    }
};

// เชื่อมต่อกับ SQL Server
mssql.connect(dbConfig)
    .then(() => console.log("Connected to SQL Server"))
    .catch(err => console.error('SQL Server connection failed', err));

// เส้นทางสำหรับหน้าเว็บ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html')); // ส่งไฟล์ index.html เมื่อเข้า / 
});

app.get('/signin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signin.html')); // ส่งไฟล์ signin.html
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html')); // ส่งไฟล์ signup.html
});

app.get('/mail', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mail.html')); // ส่งไฟล์ mail.html
});

// การเข้าสู่ระบบ (signin)
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
            return res.json({ success: true, message: 'Login successful' });
        } else {
            return res.status(401).json({ success: false, message: 'Incorrect password' });
        }
    } catch (err) {
        console.error('Error during login:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// การลงทะเบียนผู้ใช้ (signup)
app.post('/signup', async (req, res) => {
    const { username, email, password, firstName, lastName } = req.body;

    try {
        const request = new mssql.Request();
        request.input('username', mssql.NVarChar, username);
        request.input('email', mssql.NVarChar, email);

        const result = await request.query('SELECT * FROM users WHERE username = @username OR email = @email');

        if (result.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'Username or email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        request.input('hashedPassword', mssql.NVarChar, hashedPassword);
        request.input('firstName', mssql.NVarChar, firstName);
        request.input('lastName', mssql.NVarChar, lastName);

        await request.query('INSERT INTO users (username, email, password, firstName, lastName) VALUES (@username, @email, @hashedPassword, @firstName, @lastName)');

        res.json({ success: true, message: 'Registration successful' });
    } catch (err) {
        console.error('Error during registration:', err);
        return res.status(500).json({ success: false, message: 'Failed to register user' });
    }
});

// เริ่มต้นเซิร์ฟเวอร์
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
