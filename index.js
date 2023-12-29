const express = require('express');
const app = express();
const port = process.env.PORT || 8080;
const path = require('path');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

// Use environment variables for configuration
const url = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'rest-api';
const client = new MongoClient(url);
// Add this block to your index.js file before defining routes
const userCollection = client.db(dbName).collection('users');

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve static files from the same directory as this script
app.use(express.static(__dirname));

app.post('/rest-api/register', async (req, res, next) => {
    const userData = req.body;
    try {
        await client.connect();
        // Check if the username is already taken
        const existingUser = await userCollection.findOne({ username: userData.username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username is already taken' });
        }

        // Create a new user
        const newUser = {
            username: userData.username,
            password: userData.password, // Note: You should hash the password in a real application
        };

        await userCollection.insertOne(newUser);
        res.json({ message: 'User registered successfully' });
    } catch (error) {
        next(error);
    } finally {
        client.close();
    }
})

const bcrypt = require('bcrypt'); // Install using npm install bcrypt

app.post('/rest-api/login', async (req, res, next) => {
    const loginData = req.body;
    try {
        await client.connect();
        // Find the user by username
        const user = await userCollection.findOne({ username: loginData.username });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Check the password
        const passwordMatch = await bcrypt.compare(loginData.password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        res.json({ message: 'Login successful' });
    } catch (error) {
        next(error);
    } finally {
        client.close();
    }
})

async function getMonitoring(res, id = false) {
    try {
        await client.connect();
        if (id) {
            const data = await client.db(dbName).collection('monitoring').find({ _id: new ObjectId(id) }).sort({ '_id': -1 }).toArray();
            res.json(data);
        } else {
            const data = await client.db(dbName).collection('monitoring').find({}).sort({ '_id': -1 }).toArray();
            res.json(data);
        }
    } finally {
        // Close the connection outside the try block
        client.close();
    }
}

app.get('/rest-api/monitoring/:id', async (req, res, next) => {
    const id = req.params.id;
    try {
        await getMonitoring(res, id);
    } catch (error) {
        next(error);
    }
});

app.post('/rest-api/monitoring/update/:id', async (req, res, next) => {
    const id = req.params.id;
    const monitoringData = req.body;
    try {
        await client.connect();
        await client.db(dbName).collection('monitoring').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    ID: monitoringData.newId,
                    tanggal: monitoringData.newTanggal,
                    keterangan: monitoringData.newKeterangan,
                    nominal: monitoringData.newNominal,
                    opsi: monitoringData.newOpsi,
                }
            }
        );
        res.json({ message: 'Data updated' });
    } catch (error) {
        next(error);
    } finally {
        // Close the connection outside the try block
        client.close();
    }
});

app.post('/rest-api/monitoring/delete/:id', async (req, res, next) => {
    const id = req.params.id;
    try {
        await client.connect();
        await client.db(dbName).collection('monitoring').deleteOne({ _id: new ObjectId(id) });
        res.json({ message: 'Data deleted' });
    } catch (error) {
        next(error);
    } finally {
        // Close the connection outside the try block
        client.close();
    }
});

app.get('/rest-api/data', async (req, res, next) => {
    try {
        await getMonitoring(res);
    } catch (error) {
        next(error);
    }
});

app.post('/rest-api/insert', async (req, res, next) => {
    const monitoringData = req.body;
    try {
        await client.connect();
        await client.db(dbName).collection('monitoring').insertOne({
            ID: monitoringData.newId,
            tanggal: monitoringData.newTanggal,
            keterangan: monitoringData.newKeterangan,
            nominal: monitoringData.newNominal,
            opsi: monitoringData.newOpsi,
        });
        res.json({ message: 'Data added to database' });
    } catch (error) {
        next(error);
    } finally {
        // Close the connection outside the try block
        client.close();
    }
});

// This route serves the index.html file
app.get('/rest-api', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`listening on port ${port}`);
});

// Registration endpoint
app.post('/rest-api/register', async (req, res, next) => {
    const { username, password } = req.body;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        await client.connect();
        const result = await client.db(dbName).collection('users').insertOne({
            username: username,
            password: hashedPassword,
        });

        res.json({ message: 'Registration successful', userId: result.insertedId });
    } catch (error) {
        next(error);
    } finally {
        client.close();
    }
});

// Login endpoint
app.post('/rest-api/login', async (req, res, next) => {
    const { username, password } = req.body;

    try {
        await client.connect();
        const user = await client.db(dbName).collection('users').findOne({ username: username });

        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Create a token
        const token = jwt.sign({ userId: user._id, username: user.username }, 'your_secret_key', { expiresIn: '1h' });

        res.json({ message: 'Login successful', token: token });
    } catch (error) {
        next(error);
    } finally {
        client.close();
    }
});

// Middleware to verify token
function verifyToken(req, res, next) {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, 'your_secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ message: 'Invalid token.' });
    }
}

// Protected route (requires token)
app.get('/rest-api/home', verifyToken, (req, res) => {
    // Access user information from req.user
    res.json({ message: 'You have access to the home page.', user: req.user });
});


