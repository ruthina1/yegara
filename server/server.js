const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Courses table
  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Course content table
  db.run(`CREATE TABLE IF NOT EXISTS course_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK(content_type IN ('video', 'pdf')),
    content_url TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    FOREIGN KEY (course_id) REFERENCES courses(id)
  )`);

  // User progress table
  db.run(`CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    content_id INTEGER NOT NULL,
    completed BOOLEAN DEFAULT 0,
    progress_percentage INTEGER DEFAULT 0,
    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (content_id) REFERENCES course_content(id),
    UNIQUE(user_id, content_id)
  )`);

  // Course ratings table
  db.run(`CREATE TABLE IF NOT EXISTS course_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE(user_id, course_id)
  )`);
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user exists
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (row) {
        return res.status(400).json({ error: 'User already exists' });
      }

      try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        db.run(
          'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
          [email, hashedPassword, name],
          function(err) {
            if (err) {
              console.error('Insert error:', err);
              return res.status(500).json({ error: 'Failed to create user' });
            }

            const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET);
            res.status(201).json({
              token,
              user: { id: this.lastID, email, name }
            });
          }
        );
      } catch (hashError) {
        console.error('Hash error:', hashError);
        return res.status(500).json({ error: 'Failed to process password' });
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      try {
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
        res.json({
          token,
          user: { id: user.id, email: user.email, name: user.name }
        });
      } catch (compareError) {
        console.error('Password compare error:', compareError);
        return res.status(500).json({ error: 'Authentication error' });
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Course Routes
app.get('/api/courses', authenticateToken, (req, res) => {
  db.all('SELECT * FROM courses ORDER BY created_at DESC', (err, courses) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Get ratings for all courses
    const courseIds = courses.map(c => c.id);
    if (courseIds.length === 0) {
      return res.json(courses);
    }

    const placeholders = courseIds.map(() => '?').join(',');
    db.all(
      `SELECT course_id, AVG(rating) as avg_rating, COUNT(*) as total_ratings
       FROM course_ratings
       WHERE course_id IN (${placeholders})
       GROUP BY course_id`,
      courseIds,
      (err, ratings) => {
        if (err) {
          return res.json(courses); // Return courses without ratings if error
        }

        const ratingsMap = {};
        ratings.forEach(r => {
          ratingsMap[r.course_id] = {
            averageRating: parseFloat(r.avg_rating.toFixed(1)),
            totalRatings: r.total_ratings
          };
        });

        const coursesWithRatings = courses.map(course => ({
          ...course,
          averageRating: ratingsMap[course.id]?.averageRating || 0,
          totalRatings: ratingsMap[course.id]?.totalRatings || 0
        }));

        res.json(coursesWithRatings);
      }
    );
  });
});

app.get('/api/courses/:id', authenticateToken, (req, res) => {
  const courseId = req.params.id;

  db.get('SELECT * FROM courses WHERE id = ?', [courseId], (err, course) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Get course content
    db.all(
      'SELECT * FROM course_content WHERE course_id = ? ORDER BY order_index',
      [courseId],
      (err, content) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ ...course, content });
      }
    );
  });
});

// User progress routes
app.get('/api/progress/:courseId', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const courseId = req.params.courseId;

  db.all(
    'SELECT * FROM user_progress WHERE user_id = ? AND course_id = ?',
    [userId, courseId],
    (err, progress) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(progress);
    }
  );
});

app.post('/api/progress', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { courseId, contentId, completed, progressPercentage } = req.body;

  db.run(
    `INSERT OR REPLACE INTO user_progress 
     (user_id, course_id, content_id, completed, progress_percentage, last_accessed)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [userId, courseId, contentId, completed ? 1 : 0, progressPercentage || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Course ratings routes
app.post('/api/ratings', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { courseId, rating } = req.body;

  if (!courseId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Invalid rating data' });
  }

  db.run(
    `INSERT OR REPLACE INTO course_ratings (user_id, course_id, rating, created_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [userId, courseId, rating],
    function(err) {
      if (err) {
        console.error('Rating error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.get('/api/ratings/:courseId', (req, res) => {
  const courseId = req.params.courseId;

  db.get(
    `SELECT 
      AVG(rating) as average_rating,
      COUNT(*) as total_ratings
     FROM course_ratings 
     WHERE course_id = ?`,
    [courseId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({
        averageRating: row.average_rating ? parseFloat(row.average_rating.toFixed(1)) : 0,
        totalRatings: row.total_ratings || 0
      });
    }
  );
});

app.get('/api/ratings/user/:courseId', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const courseId = req.params.courseId;

  db.get(
    `SELECT rating FROM course_ratings 
     WHERE user_id = ? AND course_id = ?`,
    [userId, courseId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ userRating: row ? row.rating : null });
    }
  );
});


// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Seed sample data
function seedDatabase() {
  db.serialize(() => {
    // Check if courses already exist
    db.get('SELECT COUNT(*) as count FROM courses', (err, row) => {
      if (err || row.count > 0) {
        return; // Already seeded
      }

      // Insert sample courses with working images
      db.run(
        `INSERT INTO courses (title, description, thumbnail_url) VALUES 
         ('Introduction to Web Development', 'Learn the fundamentals of web development including HTML, CSS, and JavaScript. Perfect for beginners.', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=300&fit=crop&auto=format'),
         ('React Mastery', 'Master React.js and build modern web applications with hooks, context, and advanced patterns.', 'https://images.unsplash.com/photo-1498050108023-c5249f4f0853?w=400&h=300&fit=crop&auto=format'),
         ('Node.js Backend Development', 'Build scalable backend applications with Node.js and Express. Learn RESTful APIs and database integration.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop&auto=format'),
         ('Python Programming Fundamentals', 'Start your journey with Python programming. Learn syntax, data structures, and object-oriented programming.', 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=400&h=300&fit=crop&auto=format'),
         ('Data Science & Analytics', 'Master data analysis, visualization, and machine learning with Python and popular libraries.', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop&auto=format'),
         ('UI/UX Design Principles', 'Learn the fundamentals of user interface and user experience design. Create beautiful and functional designs.', 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&h=300&fit=crop&auto=format'),
         ('Mobile App Development', 'Build native and cross-platform mobile applications using React Native and Flutter.', 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop&auto=format'),
         ('Cloud Computing & AWS', 'Master cloud infrastructure, deployment, and management with Amazon Web Services.', 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=300&fit=crop&auto=format'),
         ('Cybersecurity Fundamentals', 'Learn essential cybersecurity concepts, threat detection, and security best practices.', 'https://images.unsplash.com/photo-1563986768609-322da13575ef?w=400&h=300&fit=crop&auto=format'),
         ('Digital Marketing Strategy', 'Master SEO, social media marketing, content strategy, and analytics to grow your business.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop&auto=format'),
         ('Project Management Essentials', 'Learn agile methodologies, Scrum, Kanban, and effective project management techniques.', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=300&fit=crop&auto=format'),
         ('Business Leadership & Management', 'Develop leadership skills, team management, and strategic thinking for business success.', 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=300&fit=crop&auto=format'),
         ('JavaScript Advanced Concepts', 'Deep dive into advanced JavaScript topics including closures, promises, async/await, and design patterns.', 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=400&h=300&fit=crop&auto=format'),
         ('Vue.js Complete Guide', 'Learn Vue.js from scratch to advanced level. Build reactive and scalable web applications.', 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&h=300&fit=crop&auto=format'),
         ('Angular Framework Mastery', 'Master Angular framework and build enterprise-level applications with TypeScript.', 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=400&h=300&fit=crop&auto=format'),
         ('Full Stack Development', 'Become a full-stack developer by mastering both frontend and backend technologies.', 'https://images.unsplash.com/photo-1498050108023-c5249f4f0853?w=400&h=300&fit=crop&auto=format'),
         ('Database Design & SQL', 'Learn database design principles, SQL queries, and database optimization techniques.', 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=400&h=300&fit=crop&auto=format'),
         ('MongoDB & NoSQL Databases', 'Master MongoDB and NoSQL database concepts for modern application development.', 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&h=300&fit=crop&auto=format'),
         ('GraphQL API Development', 'Learn GraphQL and build efficient APIs for modern web and mobile applications.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop&auto=format'),
         ('Docker & Containerization', 'Master Docker and containerization technologies for efficient application deployment.', 'https://images.unsplash.com/photo-1605745341112-85968b19335b?w=400&h=300&fit=crop&auto=format'),
         ('Kubernetes Orchestration', 'Learn Kubernetes for container orchestration and scalable application management.', 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=300&fit=crop&auto=format'),
         ('DevOps Fundamentals', 'Master DevOps practices including CI/CD, automation, and infrastructure as code.', 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&h=300&fit=crop&auto=format'),
         ('Machine Learning Basics', 'Introduction to machine learning concepts, algorithms, and practical applications.', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop&auto=format'),
         ('Deep Learning with TensorFlow', 'Advanced deep learning techniques using TensorFlow and neural networks.', 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=400&h=300&fit=crop&auto=format'),
         ('Natural Language Processing', 'Learn NLP techniques for text analysis, sentiment analysis, and language models.', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop&auto=format'),
         ('Computer Vision Fundamentals', 'Introduction to computer vision, image processing, and object detection.', 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=400&h=300&fit=crop&auto=format'),
         ('Blockchain Development', 'Learn blockchain technology, smart contracts, and cryptocurrency development.', 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop&auto=format'),
         ('Ethereum & Smart Contracts', 'Master Ethereum blockchain and develop smart contracts using Solidity.', 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop&auto=format'),
         ('Web3 Development', 'Build decentralized applications (dApps) and explore the Web3 ecosystem.', 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop&auto=format'),
         ('Graphic Design Fundamentals', 'Learn design principles, typography, color theory, and visual communication.', 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&h=300&fit=crop&auto=format'),
         ('Adobe Photoshop Mastery', 'Master Adobe Photoshop for professional image editing and graphic design.', 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&h=300&fit=crop&auto=format'),
         ('Illustrator & Vector Graphics', 'Learn Adobe Illustrator for creating scalable vector graphics and illustrations.', 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&h=300&fit=crop&auto=format'),
         ('Figma UI Design', 'Master Figma for collaborative UI/UX design and prototyping.', 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&h=300&fit=crop&auto=format'),
         ('Video Editing & Production', 'Learn professional video editing techniques using industry-standard tools.', 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop&auto=format'),
         ('Content Writing & Copywriting', 'Master the art of persuasive writing and content creation for digital marketing.', 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400&h=300&fit=crop&auto=format'),
         ('Social Media Marketing', 'Learn strategies for effective social media marketing across all major platforms.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop&auto=format'),
         ('Email Marketing Mastery', 'Master email marketing campaigns, automation, and conversion optimization.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop&auto=format'),
         ('Google Analytics & SEO', 'Learn Google Analytics and advanced SEO techniques to improve website visibility.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop&auto=format'),
         ('E-commerce Development', 'Build and manage successful e-commerce platforms with modern technologies.', 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop&auto=format'),
         ('WordPress Development', 'Master WordPress theme and plugin development for custom websites.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop&auto=format'),
         ('Shopify Store Setup', 'Learn to create and customize Shopify stores for e-commerce success.', 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop&auto=format'),
         ('Financial Planning & Analysis', 'Master financial planning, budgeting, and financial analysis for business.', 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop&auto=format'),
         ('Accounting Fundamentals', 'Learn accounting principles, bookkeeping, and financial reporting.', 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop&auto=format'),
         ('Entrepreneurship Essentials', 'Learn how to start and grow a successful business from idea to execution.', 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=300&fit=crop&auto=format'),
         ('Sales & Negotiation Skills', 'Master sales techniques and negotiation strategies for business success.', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=300&fit=crop&auto=format'),
         ('Customer Service Excellence', 'Learn best practices for delivering exceptional customer service.', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=300&fit=crop&auto=format'),
         ('Public Speaking & Presentation', 'Develop confidence and skills for effective public speaking and presentations.', 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=300&fit=crop&auto=format'),
         ('Time Management & Productivity', 'Learn techniques to maximize productivity and manage time effectively.', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=300&fit=crop&auto=format'),
         ('Conflict Resolution Skills', 'Master techniques for resolving conflicts in professional and personal settings.', 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=300&fit=crop&auto=format'),
         ('Emotional Intelligence', 'Develop emotional intelligence for better relationships and leadership.', 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=300&fit=crop&auto=format'),
         ('Team Building & Collaboration', 'Learn strategies for building effective teams and fostering collaboration.', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=300&fit=crop&auto=format'),
         ('Strategic Planning & Execution', 'Master strategic planning and execution for organizational success.', 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=300&fit=crop&auto=format')`,
        function(err) {
          if (err) {
            console.log('Error seeding courses:', err);
            return;
          }

          // Insert course content
          const courseContents = [
            { courseId: 1, title: 'HTML Basics', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', order: 1 },
            { courseId: 1, title: 'CSS Fundamentals', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', order: 2 },
            { courseId: 1, title: 'JavaScript Introduction', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 3 },
            { courseId: 2, title: 'React Components', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', order: 1 },
            { courseId: 2, title: 'State Management', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 3, title: 'Express Setup', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', order: 1 },
            { courseId: 3, title: 'Database Integration', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 4, title: 'Python Basics', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', order: 1 },
            { courseId: 4, title: 'Data Structures', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', order: 2 },
            { courseId: 5, title: 'Data Analysis', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', order: 1 },
            { courseId: 5, title: 'Visualization Techniques', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 6, title: 'Design Principles', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', order: 1 },
            { courseId: 6, title: 'User Research', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 7, title: 'React Native Basics', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', order: 1 },
            { courseId: 7, title: 'App Deployment', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 8, title: 'AWS Fundamentals', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', order: 1 },
            { courseId: 8, title: 'Cloud Architecture', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 9, title: 'Security Basics', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', order: 1 },
            { courseId: 9, title: 'Threat Detection', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 10, title: 'SEO Fundamentals', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', order: 1 },
            { courseId: 10, title: 'Social Media Strategy', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 11, title: 'Agile Methodology', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', order: 1 },
            { courseId: 11, title: 'Scrum Framework', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
            { courseId: 12, title: 'Leadership Skills', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', order: 1 },
            { courseId: 12, title: 'Team Management', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 2 },
          ];

          // Add content for courses 13-54
          for (let i = 13; i <= 54; i++) {
            courseContents.push(
              { courseId: i, title: 'Introduction', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', order: 1 },
              { courseId: i, title: 'Advanced Concepts', type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', order: 2 },
              { courseId: i, title: 'Practical Applications', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', order: 3 }
            );
          }

          const stmt = db.prepare('INSERT INTO course_content (course_id, title, content_type, content_url, order_index) VALUES (?, ?, ?, ?, ?)');
          courseContents.forEach(content => {
            stmt.run(content.courseId, content.title, content.type, content.url, content.order);
          });
          stmt.finalize();

          console.log('Sample data seeded successfully');
        }
      );
    });
  });
}

// Seed database on startup
setTimeout(seedDatabase, 1000);
