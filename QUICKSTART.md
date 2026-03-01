# Quick Start Guide

## Prerequisites
- Node.js (v14 or higher)
- npm or yarn

## Step 1: Install Dependencies

### Option A: Install Everything at Once
```bash
npm run install-all
```

### Option B: Install Separately
```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

## Step 2: Start the Backend Server

Open a terminal and run:
```bash
cd server
npm start
```

The server will start on `http://localhost:5000`

## Step 3: Start the Frontend

Open another terminal and run:
```bash
cd client
npm start
```

The app will open automatically at `http://localhost:3000`

## Step 4: Access the Application

1. Visit `http://localhost:3000` in your browser
2. Click "Get Started" or "Sign Up" to create an account
3. After registration, you'll be redirected to the courses page
4. Browse courses and start learning!

## Sample Data

The database is automatically seeded with sample courses when you first start the server. You'll see:
- Introduction to Web Development
- React Mastery
- Node.js Backend Development

Each course contains sample video and PDF content.

## Troubleshooting

### Port Already in Use
If port 5000 or 3000 is already in use:
- Backend: Change `PORT` in `server/.env`
- Frontend: React will prompt you to use a different port

### Database Issues
If you encounter database errors:
- Delete `server/database.sqlite` and restart the server
- The database will be recreated automatically

### CORS Errors
Make sure the backend is running before starting the frontend, and that the API URL in the frontend matches your backend port.

## Development Mode

To run both servers simultaneously with auto-reload:
```bash
npm run dev
```

(Requires `concurrently` package - install with `npm install` in root directory)
