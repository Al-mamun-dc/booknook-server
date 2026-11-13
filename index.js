
import express from 'express'
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'
import { jwtVerify, createRemoteJWKSet } from 'jose';

const app = express()
const PORT = 8000

app.use(cors())
app.use(express.json())

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
        throw err;
    }
}

const mongoClient = await connectToMongoDB()
const db = mongoClient.db("booknook")

const addCollection = db.collection("add");
const borrowCollection = db.collection("borrows");

// JWT Middleware
const JWKS = createRemoteJWKSet(
    new URL("http://localhost:3000/api/auth/jwks")
)

const verfyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).send({ msg: 'Unauthorized' })
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).send({ msg: 'Unauthorized' })
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
    } catch (error) {
        return res.status(401).send({ msg: 'Unauthorized' });
    }
}

// Add New Book
app.post('/add-books', verfyToken, async (req, res) => {
    const data = {
        ...req.body,
        userEmail: req.user.email
    };

    const result = await addCollection.insertOne(data);

    res.send(result);
})

// Get All Books
app.get('/all-books', verfyToken, async (req, res) => {
    const result = await addCollection.find().toArray();
    res.send(result);
})

// Get Single Book
app.get('/all-books/:id', verfyToken, async (req, res) => {

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid book ID" });
    }

    const result = await addCollection.findOne({
        _id: new ObjectId(id)
    });

    res.send(result);
})

// New Arrivals
app.get('/new-arrivals', async (req, res) => {
    const result = await addCollection
        .find()
        .sort({ _id: -1 })
        .limit(6)
        .toArray();

    res.send(result);
});

// My Added Books
app.get('/my-books', async (req, res) => {
    const email = req.user.email;

    const result = await addCollection
        .find({ userEmail: email })
        .toArray();

    res.send(result);
})

// Update Book
app.patch('/all-books/:id', verfyToken, async (req, res) => {
    const { id } = req.params;
    const data = req.body;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid book ID" });
    }

    const result = await addCollection.updateOne(
        {
            _id: new ObjectId(id),
            userEmail: req.user.email
        },
        {
            $set: data
        }
    );

    res.send(result);
})

// Delete Book
app.delete('/all-books/:id', verfyToken, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid book ID" });
    }

    const result = await addCollection.deleteOne({
        _id: new ObjectId(id),
        userEmail: req.user.email
    });

    res.send(result);
})

// Borrow Book
app.post('/borrow-books', verfyToken, async (req, res) => {
    try {
        const {
            bookId,
            bookTitle,
            bookImage
        } = req.body;

        const userName = req.user.name;
        const userEmail = req.user.email;

        if (!bookId || !bookTitle || !userName || !userEmail) {
            return res.status(400).send({
                message: "Required information missing"
            });
        }

        if (!ObjectId.isValid(bookId)) {
            return res.status(400).send({
                message: "Invalid book ID"
            });
        }

        const book = await addCollection.findOne({
            _id: new ObjectId(bookId)
        });

        if (!book) {
            return res.status(404).send({
                message: "Book not found"
            });
        }

        const borrowDate = new Date();

        const returnDate = new Date();
        returnDate.setDate(returnDate.getDate() + 14);

        const borrowData = {
            bookId,
            bookTitle,
            bookImage,
            userName,
            userEmail,
            borrowDate,
            returnDate,
            status: "borrowed"
        };

        const result = await borrowCollection.insertOne(borrowData);

        res.status(201).send({
            success: true,
            message: "Book borrowed successfully",
            result
        });

    } catch (error) {
        console.log(error);

        res.status(500).send({
            message: "Failed to borrow book"
        });
    }
});

// My Borrowed Books
app.get('/my-borrows', verfyToken, async (req, res) => {
    try {
        const email = req.user.email;

        const result = await borrowCollection
            .find({
                userEmail: email,
                status: "borrowed"
            })
            .sort({ borrowDate: -1 })
            .toArray();

        res.send(result);

    } catch (error) {
        console.log(error);

        res.status(500).send({
            message: "Failed to get borrowed books"
        });
    }
});

// Return Book
app.patch('/return-book/:id', verfyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const email = req.user.email;

        if (!ObjectId.isValid(id)) {
            return res.status(400).send({
                message: "Invalid borrow ID"
            });
        }

        const result = await borrowCollection.updateOne(
            {
                _id: new ObjectId(id),
                userEmail: email,
                status: "borrowed"
            },
            {
                $set: {
                    status: "returned",
                    returnedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({
                message: "Borrow record not found"
            });
        }

        res.send({
            success: true,
            message: "Book returned successfully"
        });

    } catch (error) {
        console.log(error);

        res.status(500).send({
            message: "Failed to return book"
        });
    }
});

// Home Route
app.get('/', (req, res) => {
    res.send({
        message: 'server is running fine'
    });
})

app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
});
