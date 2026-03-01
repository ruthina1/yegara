# Yegara LMS - Modern Learning Management System

A modern, full-stack Learning Management System (LMS) built with React and Node.js, featuring a clean, responsive design and comprehensive course management capabilities.

## Features

✅ **Modern Website Design**
- Fresh, clean, and modern UI/UX
- Responsive design for desktop and mobile devices
- Beautiful gradient themes and smooth animations

✅ **Built-in LMS System**
- Member authentication (Sign up / Login)
- Course browsing and management
- Video and PDF content viewing
- Progress tracking
- Dynamic content from database

✅ **Full-Stack Architecture**
- React frontend with modern hooks and context API
- Express.js backend with RESTful API
- SQLite database for data persistence
- JWT-based authentication

## Tech Stack

### Frontend
- React 19.2.4
- React Router DOM 6.20.0
- Axios for API calls
- CSS3 with modern design patterns

### Backend
- Node.js
- Express.js
- SQLite3
- JWT (JSON Web Tokens)
- bcryptjs for password hashing

## Project Structure

```
Yegara/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── context/        # React context (Auth)
│   │   ├── utils/          # Utility functions
│   │   └── App.js          # Main app component
│   └── package.json
├── server/                 # Node.js backend
│   ├── server.js          # Express server
│   ├── package.json
│   └── .env               # Environment variables
└── README.md
```

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Backend Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (already created) with:
```
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (optional, defaults to localhost:5000):
```
REACT_APP_API_URL=http://localhost:5000/api
```

4. Start the development server:
```bash
npm start
```

The app will open at `http://localhost:3000`

## Usage

1. **Home Page**: Visit the root URL to see the landing page
2. **Register**: Create a new account with email, password, and name
3. **Login**: Sign in with your credentials
4. **Browse Courses**: View all available courses after logging in
5. **View Course**: Click on a course to see its content
6. **Watch/Read**: Access video or PDF content within courses
7. **Track Progress**: Your progress is automatically saved

## Database Schema

The system uses SQLite with the following tables:

- **users**: User accounts and authentication
- **courses**: Course information
- **course_content**: Individual lessons/content items
- **user_progress**: User progress tracking

Sample data is automatically seeded on first server start.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Courses
- `GET /api/courses` - Get all courses (protected)
- `GET /api/courses/:id` - Get course details (protected)

### Progress
- `GET /api/progress/:courseId` - Get user progress (protected)
- `POST /api/progress` - Update user progress (protected)

## Features in Detail

### Authentication
- Secure password hashing with bcrypt
- JWT token-based authentication
- Protected routes for authenticated users only

### Course Management
- Dynamic course listing from database
- Course detail pages with content navigation
- Support for both video and PDF content
- Progress tracking per content item

### Responsive Design
- Mobile-first approach
- Desktop-optimized layouts
- Smooth transitions and animations
- Modern UI components

## Development

### Adding New Courses

Courses can be added directly to the database or through API endpoints. The database is automatically initialized with sample courses on first run.

### Customization

- Colors and themes can be modified in the CSS files
- API endpoints can be extended in `server/server.js`
- Components can be customized in `client/src/components/`

## Production Deployment

1. Build the React app:
```bash
cd client
npm run build
```

2. Set production environment variables
3. Use a production database (PostgreSQL, MySQL, etc.)
4. Configure proper CORS settings
5. Use environment variables for sensitive data

## License

This project is open source and available for educational purposes.

## Support

For issues or questions, please check the code comments or create an issue in the repository.
