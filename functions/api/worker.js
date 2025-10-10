const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;
    const method = request.method;

    // Remove /api prefix if present
    if (path.startsWith('/api')) {
      path = path.substring(4);
    }

    console.log(`[${method}] ${path}`);

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Check database binding
    if (!env.DB) {
      return jsonResponse({ error: 'Database not configured. Add D1 binding named "DB"' }, 500);
    }

    try {
      // ============================================
      // AUTHENTICATION ENDPOINTS
      // ============================================
      
      // POST /auth/login
      if (path === '/auth/login' && method === 'POST') {
        const { email, password } = await request.json();
        
        if (!email || !password) {
          return jsonResponse({ error: 'Email and password required' }, 400);
        }

        const user = await env.DB.prepare(
          'SELECT * FROM users WHERE email = ? AND password = ?'
        ).bind(email, password).first();

        if (!user) {
          return jsonResponse({ error: 'Invalid credentials' }, 401);
        }

        const clubs = await env.DB.prepare(
          'SELECT club_id FROM club_members WHERE user_id = ?'
        ).bind(user.id).all();

        return jsonResponse({
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            clubs: clubs.results.map(c => c.club_id)
          }
        });
      }

      // POST /auth/register
      if (path === '/auth/register' && method === 'POST') {
        const { email, password, role = 'Member' } = await request.json();
        
        if (!email || !password) {
          return jsonResponse({ error: 'Email and password required' }, 400);
        }

        // Validate role
        if (!['Admin', 'Leader', 'Member'].includes(role)) {
          return jsonResponse({ error: 'Invalid role. Must be Admin, Leader, or Member' }, 400);
        }

        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE email = ?'
        ).bind(email).first();

        if (existing) {
          return jsonResponse({ error: 'User already exists' }, 409);
        }

        const result = await env.DB.prepare(
          'INSERT INTO users (email, password, role) VALUES (?, ?, ?) RETURNING *'
        ).bind(email, password, role).first();

        return jsonResponse({
          user: {
            id: result.id,
            email: result.email,
            role: result.role,
            clubs: []
          }
        }, 201);
      }

      // ============================================
      // CLUBS ENDPOINTS
      // ============================================
      
      // GET /clubs - Get all clubs with details
      if (path === '/clubs' && method === 'GET') {
        const clubs = await env.DB.prepare('SELECT * FROM clubs').all();
        
        const clubsWithDetails = await Promise.all(
          clubs.results.map(async (club) => {
            const members = await env.DB.prepare(
              'SELECT user_id FROM club_members WHERE club_id = ?'
            ).bind(club.id).all();
            
            const announcements = await env.DB.prepare(
              'SELECT id, text, datetime(created_at) as date FROM club_announcements WHERE club_id = ? ORDER BY created_at DESC LIMIT 10'
            ).bind(club.id).all();
            
            const events = await env.DB.prepare(
              'SELECT id, title, description, event_date as date FROM events WHERE club_id = ? ORDER BY event_date ASC'
            ).bind(club.id).all();
            
            return {
              id: club.id,
              name: club.name,
              description: club.description,
              image: club.image,
              adminId: club.admin_id,
              leaderId: club.leader_id,
              members: members.results.map(m => m.user_id),
              announcements: announcements.results,
              events: events.results
            };
          })
        );
        
        return jsonResponse({ clubs: clubsWithDetails });
      }

      // GET /clubs/:id - Get specific club
      if (path.match(/^\/clubs\/\d+$/) && method === 'GET') {
        const clubId = parseInt(path.split('/')[2]);
        
        const club = await env.DB.prepare(
          'SELECT * FROM clubs WHERE id = ?'
        ).bind(clubId).first();

        if (!club) {
          return jsonResponse({ error: 'Club not found' }, 404);
        }

        const members = await env.DB.prepare(
          'SELECT user_id FROM club_members WHERE club_id = ?'
        ).bind(clubId).all();
        
        const announcements = await env.DB.prepare(
          'SELECT id, text, datetime(created_at) as date FROM club_announcements WHERE club_id = ? ORDER BY created_at DESC'
        ).bind(clubId).all();
        
        const events = await env.DB.prepare(
          'SELECT id, title, description, event_date as date FROM events WHERE club_id = ? ORDER BY event_date ASC'
        ).bind(clubId).all();

        return jsonResponse({
          club: {
            id: club.id,
            name: club.name,
            description: club.description,
            image: club.image,
            adminId: club.admin_id,
            leaderId: club.leader_id,
            members: members.results.map(m => m.user_id),
            announcements: announcements.results,
            events: events.results
          }
        });
      }

      // POST /clubs - Create new club
      if (path === '/clubs' && method === 'POST') {
        const { name, description, image, adminId, leaderId } = await request.json();
        
        if (!name || !description || !image) {
          return jsonResponse({ error: 'Name, description, and image required' }, 400);
        }

        const result = await env.DB.prepare(
          'INSERT INTO clubs (name, description, image, admin_id, leader_id) VALUES (?, ?, ?, ?, ?) RETURNING *'
        ).bind(name, description, image, adminId || null, leaderId || null).first();

        return jsonResponse({
          club: {
            id: result.id,
            name: result.name,
            description: result.description,
            image: result.image,
            adminId: result.admin_id,
            leaderId: result.leader_id,
            members: [],
            announcements: [],
            events: []
          }
        }, 201);
      }

      // PUT /clubs/:id - Update club
      if (path.match(/^\/clubs\/\d+$/) && method === 'PUT') {
        const clubId = parseInt(path.split('/')[2]);
        const { name, description, image, leaderId } = await request.json();

        if (!name && !description && !image && !leaderId) {
          return jsonResponse({ error: 'At least one field required' }, 400);
        }

        const club = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(clubId).first();
        
        if (!club) {
          return jsonResponse({ error: 'Club not found' }, 404);
        }

        await env.DB.prepare(
          'UPDATE clubs SET name = COALESCE(?, name), description = COALESCE(?, description), image = COALESCE(?, image), leader_id = COALESCE(?, leader_id) WHERE id = ?'
        ).bind(name || null, description || null, image || null, leaderId || null, clubId).run();

        return jsonResponse({ message: 'Club updated successfully' });
      }

      // DELETE /clubs/:id - Delete club
      if (path.match(/^\/clubs\/\d+$/) && method === 'DELETE') {
        const clubId = parseInt(path.split('/')[2]);

        const club = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(clubId).first();
        
        if (!club) {
          return jsonResponse({ error: 'Club not found' }, 404);
        }

        await env.DB.prepare('DELETE FROM clubs WHERE id = ?').bind(clubId).run();

        return jsonResponse({ message: 'Club deleted successfully' });
      }

      // POST /clubs/:id/join - Join a club
      if (path.match(/^\/clubs\/\d+\/join$/) && method === 'POST') {
        const clubId = parseInt(path.split('/')[2]);
        const { userId } = await request.json();

        if (!userId) {
          return jsonResponse({ error: 'User ID required' }, 400);
        }

        // Check if club exists
        const club = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(clubId).first();
        if (!club) {
          return jsonResponse({ error: 'Club not found' }, 404);
        }

        // Check if user exists
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        if (!user) {
          return jsonResponse({ error: 'User not found' }, 404);
        }

        // Check if already a member
        const existing = await env.DB.prepare(
          'SELECT id FROM club_members WHERE club_id = ? AND user_id = ?'
        ).bind(clubId, userId).first();

        if (existing) {
          return jsonResponse({ error: 'Already a member of this club' }, 409);
        }

        await env.DB.prepare(
          'INSERT INTO club_members (club_id, user_id) VALUES (?, ?)'
        ).bind(clubId, userId).run();

        return jsonResponse({ message: 'Successfully joined club' });
      }

      // POST /clubs/:id/leave - Leave a club
      if (path.match(/^\/clubs\/\d+\/leave$/) && method === 'POST') {
        const clubId = parseInt(path.split('/')[2]);
        const { userId } = await request.json();

        if (!userId) {
          return jsonResponse({ error: 'User ID required' }, 400);
        }

        const membership = await env.DB.prepare(
          'SELECT id FROM club_members WHERE club_id = ? AND user_id = ?'
        ).bind(clubId, userId).first();

        if (!membership) {
          return jsonResponse({ error: 'Not a member of this club' }, 404);
        }

        await env.DB.prepare(
          'DELETE FROM club_members WHERE club_id = ? AND user_id = ?'
        ).bind(clubId, userId).run();

        return jsonResponse({ message: 'Successfully left club' });
      }

      // POST /clubs/:id/announcements - Post club announcement
      if (path.match(/^\/clubs\/\d+\/announcements$/) && method === 'POST') {
        const clubId = parseInt(path.split('/')[2]);
        const { text } = await request.json();

        if (!text) {
          return jsonResponse({ error: 'Announcement text required' }, 400);
        }

        const club = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(clubId).first();
        if (!club) {
          return jsonResponse({ error: 'Club not found' }, 404);
        }

        const result = await env.DB.prepare(
          'INSERT INTO club_announcements (club_id, text) VALUES (?, ?) RETURNING *, datetime(created_at) as date'
        ).bind(clubId, text).first();

        return jsonResponse({ announcement: result }, 201);
      }

      // GET /clubs/:id/announcements - Get club announcements
      if (path.match(/^\/clubs\/\d+\/announcements$/) && method === 'GET') {
        const clubId = parseInt(path.split('/')[2]);

        const announcements = await env.DB.prepare(
          'SELECT id, text, datetime(created_at) as date FROM club_announcements WHERE club_id = ? ORDER BY created_at DESC'
        ).bind(clubId).all();

        return jsonResponse({ announcements: announcements.results });
      }

      // DELETE /clubs/:clubId/announcements/:id - Delete club announcement
      if (path.match(/^\/clubs\/\d+\/announcements\/\d+$/) && method === 'DELETE') {
        const parts = path.split('/');
        const clubId = parseInt(parts[2]);
        const announcementId = parseInt(parts[4]);

        await env.DB.prepare(
          'DELETE FROM club_announcements WHERE id = ? AND club_id = ?'
        ).bind(announcementId, clubId).run();

        return jsonResponse({ message: 'Announcement deleted successfully' });
      }

      // ============================================
      // GENERAL ANNOUNCEMENTS ENDPOINTS
      // ============================================
      
      // GET /announcements - Get all general announcements
      if (path === '/announcements' && method === 'GET') {
        const announcements = await env.DB.prepare(
          'SELECT id, text, datetime(created_at) as date FROM general_announcements ORDER BY created_at DESC'
        ).all();

        return jsonResponse({ announcements: announcements.results });
      }

      // POST /announcements - Create general announcement
      if (path === '/announcements' && method === 'POST') {
        const { text } = await request.json();

        if (!text) {
          return jsonResponse({ error: 'Announcement text required' }, 400);
        }

        const result = await env.DB.prepare(
          'INSERT INTO general_announcements (text) VALUES (?) RETURNING *, datetime(created_at) as date'
        ).bind(text).first();

        return jsonResponse({ announcement: result }, 201);
      }

      // DELETE /announcements/:id - Delete general announcement
      if (path.match(/^\/announcements\/\d+$/) && method === 'DELETE') {
        const announcementId = parseInt(path.split('/')[2]);

        await env.DB.prepare(
          'DELETE FROM general_announcements WHERE id = ?'
        ).bind(announcementId).run();

        return jsonResponse({ message: 'Announcement deleted successfully' });
      }

      // ============================================
      // EVENTS ENDPOINTS
      // ============================================
      
      // GET /events - Get all events
      if (path === '/events' && method === 'GET') {
        const events = await env.DB.prepare(
          'SELECT e.id, e.title, e.description, e.event_date as date, e.club_id, c.name as club_name FROM events e LEFT JOIN clubs c ON e.club_id = c.id ORDER BY e.event_date ASC'
        ).all();

        return jsonResponse({ events: events.results });
      }

      // GET /events/:id - Get specific event
      if (path.match(/^\/events\/\d+$/) && method === 'GET') {
        const eventId = parseInt(path.split('/')[2]);

        const event = await env.DB.prepare(
          'SELECT e.id, e.title, e.description, e.event_date as date, e.club_id, c.name as club_name FROM events e LEFT JOIN clubs c ON e.club_id = c.id WHERE e.id = ?'
        ).bind(eventId).first();

        if (!event) {
          return jsonResponse({ error: 'Event not found' }, 404);
        }

        return jsonResponse({ event });
      }

      // POST /events - Create event
      if (path === '/events' && method === 'POST') {
        const { title, description, date, clubId } = await request.json();

        if (!title || !description || !date) {
          return jsonResponse({ error: 'Title, description, and date required' }, 400);
        }

        // Validate club exists if clubId provided
        if (clubId) {
          const club = await env.DB.prepare('SELECT id FROM clubs WHERE id = ?').bind(clubId).first();
          if (!club) {
            return jsonResponse({ error: 'Club not found' }, 404);
          }
        }

        const result = await env.DB.prepare(
          'INSERT INTO events (title, description, event_date, club_id) VALUES (?, ?, ?, ?) RETURNING *'
        ).bind(title, description, date, clubId || null).first();

        return jsonResponse({
          event: {
            id: result.id,
            title: result.title,
            description: result.description,
            date: result.event_date,
            clubId: result.club_id
          }
        }, 201);
      }

      // PUT /events/:id - Update event
      if (path.match(/^\/events\/\d+$/) && method === 'PUT') {
        const eventId = parseInt(path.split('/')[2]);
        const { title, description, date, clubId } = await request.json();

        const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
        
        if (!event) {
          return jsonResponse({ error: 'Event not found' }, 404);
        }

        await env.DB.prepare(
          'UPDATE events SET title = COALESCE(?, title), description = COALESCE(?, description), event_date = COALESCE(?, event_date), club_id = COALESCE(?, club_id) WHERE id = ?'
        ).bind(title || null, description || null, date || null, clubId || null, eventId).run();

        return jsonResponse({ message: 'Event updated successfully' });
      }

      // DELETE /events/:id - Delete event
      if (path.match(/^\/events\/\d+$/) && method === 'DELETE') {
        const eventId = parseInt(path.split('/')[2]);

        const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
        
        if (!event) {
          return jsonResponse({ error: 'Event not found' }, 404);
        }

        await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(eventId).run();

        return jsonResponse({ message: 'Event deleted successfully' });
      }

      // ============================================
      // USERS ENDPOINTS
      // ============================================
      
      // GET /users - Get all users
      if (path === '/users' && method === 'GET') {
        const users = await env.DB.prepare(
          'SELECT id, email, role, datetime(created_at) as created_at FROM users'
        ).all();

        return jsonResponse({ users: users.results });
      }

      // GET /users/:id - Get specific user
      if (path.match(/^\/users\/\d+$/) && method === 'GET') {
        const userId = parseInt(path.split('/')[2]);

        const user = await env.DB.prepare(
          'SELECT id, email, role, datetime(created_at) as created_at FROM users WHERE id = ?'
        ).bind(userId).first();

        if (!user) {
          return jsonResponse({ error: 'User not found' }, 404);
        }

        const clubs = await env.DB.prepare(
          'SELECT c.id, c.name FROM clubs c JOIN club_members cm ON c.id = cm.club_id WHERE cm.user_id = ?'
        ).bind(userId).all();

        return jsonResponse({
          user: {
            ...user,
            clubs: clubs.results
          }
        });
      }

      // PUT /users/:id - Update user
      if (path.match(/^\/users\/\d+$/) && method === 'PUT') {
        const userId = parseInt(path.split('/')[2]);
        const { email, password, role } = await request.json();

        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        
        if (!user) {
          return jsonResponse({ error: 'User not found' }, 404);
        }

        if (role && !['Admin', 'Leader', 'Member'].includes(role)) {
          return jsonResponse({ error: 'Invalid role' }, 400);
        }

        await env.DB.prepare(
          'UPDATE users SET email = COALESCE(?, email), password = COALESCE(?, password), role = COALESCE(?, role) WHERE id = ?'
        ).bind(email || null, password || null, role || null, userId).run();

        return jsonResponse({ message: 'User updated successfully' });
      }

      // DELETE /users/:id - Delete user
      if (path.match(/^\/users\/\d+$/) && method === 'DELETE') {
        const userId = parseInt(path.split('/')[2]);

        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        
        if (!user) {
          return jsonResponse({ error: 'User not found' }, 404);
        }

        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

        return jsonResponse({ message: 'User deleted successfully' });
      }

      // ============================================
      // STATS ENDPOINT
      // ============================================
      
      // GET /stats - Get platform statistics
      if (path === '/stats' && method === 'GET') {
        const clubsCount = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM clubs'
        ).first();

        const usersCount = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM users'
        ).first();

        const eventsCount = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM events'
        ).first();

        const membersCount = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM club_members'
        ).first();

        return jsonResponse({
          stats: {
            totalClubs: clubsCount.count,
            totalUsers: usersCount.count,
            totalEvents: eventsCount.count,
            totalMemberships: membersCount.count
          }
        });
      }

      // ============================================
      // HEALTH CHECK
      // ============================================
      
      // GET / or GET /health - Health check
      if ((path === '/' || path === '/health') && method === 'GET') {
        return jsonResponse({
          status: 'healthy',
          message: 'ClubHub API is running',
          timestamp: new Date().toISOString(),
          database: 'connected'
        });
      }

      // No route matched
      return jsonResponse({ 
        error: 'Endpoint not found', 
        path, 
        method,
        hint: 'Check API documentation'
      }, 404);

    } catch (error) {
      console.error('❌ API Error:', error);
      return jsonResponse({ 
        error: error.message,
        stack: error.stack
      }, 500);
    }
  }
};