-- Drop existing tables for clean setup
DROP TABLE IF EXISTS club_members;
DROP TABLE IF EXISTS club_announcements;
DROP TABLE IF EXISTS general_announcements;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS clubs;
DROP TABLE IF EXISTS users;

-- Create tables
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin', 'Leader', 'Member')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    image TEXT NOT NULL,
    admin_id INTEGER,
    leader_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE club_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(club_id, user_id)
);

CREATE TABLE club_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE general_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_date DATE NOT NULL,
    club_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert Admin
INSERT INTO users (email, password, role) VALUES 
('AdminLupak@gmail.com', 'AdminLupak', 'Admin');

-- Insert Member
INSERT INTO users (email, password, role) VALUES 
('Member@gmail.com', 'Member1', 'Member');

-- Insert Leaders
INSERT INTO users (email, password, role) VALUES
('Leader1@Gmail.com', 'Leader1', 'Leader'),
('Leader2@Gmail.com', 'Leader2', 'Leader'),
('Leader3@Gmail.com', 'Leader3', 'Leader');

-- Insert Clubs with Leaders
-- Club 1: Robotics Club (Leader: Leader1, ID=3)
INSERT INTO clubs (name, description, image, admin_id, leader_id) VALUES
('Robotics Club', 'Building the future, one robot at a time. The Robotics Club offers hands-on experience in engineering, programming, and design. Join us to create innovative robots and compete in exciting challenges!', 'https://mir-s3-cdn-cf.behance.net/project_modules/hd/bb908f12412471.56268abbb66ed.png', 1, 3);

-- Club 2: Art Guild (Leader: Leader2, ID=4)
INSERT INTO clubs (name, description, image, admin_id, leader_id) VALUES
('Art Guild', 'A community for creative expression and artistic exploration. The Art Guild hosts workshops, exhibitions, and showcases for artists of all skill levels. Express yourself through various mediums!', 'https://i0.wp.com/www.palmerlibrary.org/wp-content/uploads/2024/06/Art-Club.png', 1, 4);

-- Club 3: Photography Club (Leader: Leader3, ID=5)
INSERT INTO clubs (name, description, image, admin_id, leader_id) VALUES
('Photography Club', 'Capturing moments and mastering the art of light and shadow. Join us for photo walks, exhibitions, and workshops to improve your photography skills and share your vision with the world!', 'https://i.pinimg.com/1200x/14/23/73/142373755470d869b67c30eb1e9dbdc5.jpg', 1, 5);

-- Add leaders as members of their respective clubs
INSERT INTO club_members (club_id, user_id) VALUES
(1, 3), -- Leader1 in Robotics Club
(2, 4), -- Leader2 in Art Guild
(3, 5); -- Leader3 in Photography Club

-- Add the member to one club as example
INSERT INTO club_members (club_id, user_id) VALUES
(1, 2); -- Member in Robotics Club

-- Insert club announcements
INSERT INTO club_announcements (club_id, text) VALUES
(1, 'New meeting this Friday at 4 PM in Lab C. We will be discussing our upcoming competition strategy!'),
(1, 'Reminder: Bring your Arduino kits for the next session.'),
(2, 'Portfolio review session next Tuesday at 3 PM. Bring your best work!'),
(2, 'Art exhibit submissions are now open. Deadline is next month.'),
(3, 'Photo walk this Saturday at 9 AM. Meet at the main entrance. Don''t forget your cameras!'),
(3, 'Workshop on portrait photography next Wednesday at 5 PM.');

-- Insert general announcements
INSERT INTO general_announcements (text) VALUES
('Welcome to ClubHub! Explore and join your favorite organizations.'),
('New semester starting soon! Check out all our amazing clubs and events.'),
('ClubHub now supports mobile access. Download our app today!');

-- Insert events
INSERT INTO events (title, description, event_date, club_id) VALUES
('Robotics Competition', 'Our annual robotics competition. Teams will compete in various challenges. All skill levels welcome!', '2025-11-15', 1),
('Robot Building Workshop', 'Learn the basics of robot construction and programming.', '2025-11-01', 1),
('Art Exhibit', 'Showcasing member artwork from this semester. Public viewing welcome.', '2025-11-20', 2),
('Watercolor Workshop', 'Learn watercolor techniques from a professional artist.', '2025-11-08', 2),
('Photography Walk', 'Explore the city and capture stunning urban photography.', '2025-10-28', 3),
('Portrait Photography Masterclass', 'Advanced techniques for capturing amazing portraits.', '2025-11-12', 3),
('Student Orientation', 'Orientation for all new members. Learn about all our clubs and how to get involved!', '2025-10-26', NULL),
('ClubHub Annual Gala', 'Celebration of all clubs and their achievements this year.', '2025-12-15', NULL);

-- Create indexes for performance
CREATE INDEX idx_club_members_club ON club_members(club_id);
CREATE INDEX idx_club_members_user ON club_members(user_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_club ON events(club_id);