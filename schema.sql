-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin', 'Leader', 'Member')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clubs table
CREATE TABLE IF NOT EXISTS clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    image TEXT NOT NULL,
    admin_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Club members junction table
CREATE TABLE IF NOT EXISTS club_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(club_id, user_id)
);

-- Club announcements table
CREATE TABLE IF NOT EXISTS club_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);

-- General announcements table
CREATE TABLE IF NOT EXISTS general_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_date DATE NOT NULL,
    club_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);

-- Insert default admin user
INSERT INTO users (email, password, role) 
VALUES ('AdminLupak@gmail.com', 'AdminLupak', 'Admin');

-- Insert sample clubs
INSERT INTO clubs (name, description, image, admin_id) VALUES
('Robotics Club', 'Building the future, one robot at a time. The Robotics Club offers hands-on experience in engineering, programming, and design.', 'https://mir-s3-cdn-cf.behance.net/project_modules/hd/bb908f12412471.56268abbb66ed.png', NULL),
('Art Guild', 'A community for creative expression and artistic exploration. The Art Guild hosts workshops and showcases.', 'https://i0.wp.com/www.palmerlibrary.org/wp-content/uploads/2024/06/Art-Club.png', NULL),
('Photography Club', 'Capturing moments and mastering the art of light and shadow. Photo walks and exhibitions.', 'https://i.pinimg.com/1200x/14/23/73/142373755470d869b67c30eb1e9dbdc5.jpg', NULL);

-- Insert sample club announcements
INSERT INTO club_announcements (club_id, text) VALUES
(1, 'New meeting this Friday at 4 PM in Lab C.'),
(2, 'Portfolio review session next Tuesday.');

-- Insert sample general announcements
INSERT INTO general_announcements (text) VALUES
('Welcome to ClubHub! Explore and join your favorite organizations.');

-- Insert sample events
INSERT INTO events (title, description, event_date, club_id) VALUES
('Robotics Competition', 'Our annual competition. All are welcome!', '2025-11-15', 1),
('Art Exhibit', 'Showcasing member artwork.', '2025-11-20', 2),
('Student Orientation', 'Orientation for all new members.', '2025-10-26', NULL);

-- Create indexes for better performance
CREATE INDEX idx_club_members_club ON club_members(club_id);
CREATE INDEX idx_club_members_user ON club_members(user_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_club ON events(club_id);