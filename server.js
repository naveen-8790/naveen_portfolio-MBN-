const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB Atlas connection string with URL-encoded password
// Original password: naveenrvsn8790808129@N
// URL-encoded password: naveenrvsn8790808129%40N
const mongoURI = 'mongodb+srv://naveennelakurthi2709:naveenrvsn8790808129%40N@cluster0.yfzxsew.mongodb.net/contactDB?retryWrites=true&w=majority&appName=ContactApp';

// MongoDB connection with supported options only
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000, // 30 seconds
  connectTimeoutMS: 30000, // 30 seconds
  socketTimeoutMS: 45000, // 45 seconds
  maxPoolSize: 10, // Maximum number of connections
  minPoolSize: 1, // Minimum number of connections
  maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
  heartbeatFrequencyMS: 10000, // Check connection every 10 seconds
})
.then(() => {
  console.log('MongoDB Atlas connected successfully');
  console.log('Connection state:', mongoose.connection.readyState);
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  console.error('Connection failed. Please check:');
  console.error('1. Network connectivity');
  console.error('2. MongoDB Atlas IP whitelist');
  console.error('3. Username and password');
  console.error('4. Cluster status');
});

// Connection event listeners
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// Reconnection logic
mongoose.connection.on('reconnected', () => {
  console.log('Mongoose reconnected to MongoDB Atlas');
});

// Contact schema
const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  date: { 
    type: Date, 
    default: Date.now 
  }
});

const Contact = mongoose.model('Contact', contactSchema);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'Contact Form API is running!',
    endpoints: {
      'POST /submit-contact': 'Submit a contact form',
      'GET /contacts': 'Get all contacts (for admin)',
      'GET /health': 'Health check'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Contact form submission endpoint
app.post('/submit-contact', async (req, res) => {
  try {
    // Check database connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        success: false,
        message: 'Database connection not available. Please try again later.'
      });
    }

    const { name, email, subject, message } = req.body;
    
    // Basic validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation (basic)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide a valid email address'
      });
    }
    
    // Create new contact document with timeout
    const newContact = new Contact({ 
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim()
    });
    
    // Save with a timeout
    const savedContact = await Promise.race([
      newContact.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Save operation timed out')), 15000)
      )
    ]);
    
    res.status(201).json({ 
      success: true,
      message: 'Message saved successfully',
      data: {
        id: savedContact._id,
        name: savedContact.name,
        date: savedContact.date
      }
    });
  } catch (error) {
    console.error('Error saving contact:', error);
    
    // Handle specific timeout errors
    if (error.message === 'Save operation timed out' || error.name === 'MongooseError') {
      return res.status(503).json({ 
        success: false,
        message: 'Database operation timed out. Please check your connection and try again.'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to save message. Please try again later.'
    });
  }
});

// Get all contacts (for admin purposes - consider adding authentication)
app.get('/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ date: -1 });
    res.json({
      success: true,
      count: contacts.length,
      data: contacts
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch contacts'
    });
  }
});

// Get single contact by ID
app.get('/contacts/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch contact'
    });
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Handle 404 for unknown routes (this should be last)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;