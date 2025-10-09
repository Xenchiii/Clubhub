export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api', '');
  const method = request.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let response;
    
    // POST /api/auth/login
    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json();
      
      if (!email || !password) {
        return jsonResponse({ error: 'Email and password required' }, 400, corsHeaders);
      }

      const user = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ? AND password = ?'
      ).bind(email, password).first();

      if (!user) {
        return jsonResponse({ error: 'Invalid credentials' }, 401, corsHeaders);
      }

      const clubs = await env.DB.prepare(
        'SELECT club_id FROM club_members WHERE user_id = ?'
      ).bind(user.id).all();

      response = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          clubs: clubs.results.map(c => c.club_id)
        }
      };
      return jsonResponse(response, 200, corsHeaders);
    }

    // POST /api/auth/register
    if (path === '/auth/register' && method === 'POST') {
      const { email, password, role = 'Member' } = await request.json();
      
      if (!email || !password) {
        return jsonResponse({ error: 'Email and password required' }, 400, corsHeaders);
      }

      const existing = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ?'
      ).bind(email).first();

      if (existing) {
        return jsonResponse({ error: 'User already exists' }, 409, corsHeaders);
      }

      const result = await env.DB.prepare(
        'INSERT INTO users (email, password, role) VALUES (?, ?, ?) RETURNING *'
      ).bind(email, password, role).first();

      response = {
        user: {
          id: result.id,
          email: result.email,
          role: result.role,
          clubs: []
        }
      };
      return jsonResponse(response, 201, corsHeaders);
    }
    
    // GET /api/clubs - Get all clubs
    if (path === '/clubs' && method === 'GET') {
      const clubs = await env.DB.prepare('SELECT * FROM clubs').all();
      
      const clubsWithDetails = await Promise.all(
        clubs.results.map(async (club) => {
          const members = await env.DB.prepare(
            'SELECT user_id FROM club_members WHERE club_id = ?'
          ).bind(club.id).all();
          
          const announcements = await env.DB.prepare(
            'SELECT id, text, datetime(created_at) as date FROM club_announcements WHERE club_id = ? ORDER BY created_at DESC'
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
            members: members.results.map(m => m.user_id),
            announcements: announcements.results,
            events: events.results
          };
        })
      );
      
      return jsonResponse({ clubs: clubsWithDetails }, 200, corsHeaders);
    }

    // GET /api/clubs/{id} - Get specific club
    if (path.match(/^\/clubs\/\d+$/) && method === 'GET') {
      const clubId = parseInt(path.split('/')[2]);
      
      const club = await env.DB.prepare(
        'SELECT * FROM clubs WHERE id = ?'
      ).bind(clubId).first();

      if (!club) {
        return jsonResponse({ error: 'Club not found' }, 404, corsHeaders);
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

      response = {
        club: {
          id: club.id,
          name: club.name,
          description: club.description,
          image: club.image,
          adminId: club.admin_id,
          members: members.results.map(m => m.user_id),
          announcements: announcements.results,
          events: events.results
        }
      };
      return jsonResponse(response, 200, corsHeaders);
    }

    // POST /api/clubs - Create new club
    if (path === '/clubs' && method === 'POST') {
      const { name, description, image, adminId } = await request.json();
      
      if (!name || !description || !image) {
        return jsonResponse({ error: 'Name, description, and image required' }, 400, corsHeaders);
      }

      const result = await env.DB.prepare(
        'INSERT INTO clubs (name, description, image, admin_id) VALUES (?, ?, ?, ?) RETURNING *'
      ).bind(name, description, image, adminId || null).first();

      response = {
        club: {
          id: result.id,
          name: result.name,
          description: result.description,
          image: result.image,
          adminId: result.admin_id,
          members: [],
          announcements: [],
          events: []
        }
      };
      return jsonResponse(response, 201, corsHeaders);
    }

    // PUT /api/clubs/{id} - Update club
    if (path.match(/^\/clubs\/\d+$/) && method === 'PUT') {
      const clubId = parseInt(path.split('/')[2]);
      const { name, description, image } = await request.json();

      await env.DB.prepare(
        'UPDATE clubs SET name = ?, description = ?, image = ? WHERE id = ?'
      ).bind(name, description, image, clubId).run();

      return jsonResponse({ message: 'Club updated successfully' }, 200, corsHeaders);
    }

    // DELETE /api/clubs/{id} - Delete club
    if (path.match(/^\/clubs\/\d+$/) && method === 'DELETE') {
      const clubId = parseInt(path.split('/')[2]);

      await env.DB.prepare(
        'DELETE FROM clubs WHERE id = ?'
      ).bind(clubId).run();

      return jsonResponse({ message: 'Club deleted successfully' }, 200, corsHeaders);
    }

    // POST /api/clubs/{id}/join - Join a club
    if (path.match(/^\/clubs\/\d+\/join$/) && method === 'POST') {
      const clubId = parseInt(path.split('/')[2]);
      const { userId } = await request.json();

      if (!userId) {
        return jsonResponse({ error: 'User ID required' }, 400, corsHeaders);
      }

      // Check if already a member
      const existing = await env.DB.prepare(
        'SELECT id FROM club_members WHERE club_id = ? AND user_id = ?'
      ).bind(clubId, userId).first();

      if (existing) {
        return jsonResponse({ error: 'Already a member' }, 409, corsHeaders);
      }

      await env.DB.prepare(
        'INSERT INTO club_members (club_id, user_id) VALUES (?, ?)'
      ).bind(clubId, userId).run();

      return jsonResponse({ message: 'Successfully joined club' }, 200, corsHeaders);
    }

    // POST /api/clubs/{id}/leave - Leave a club
    if (path.match(/^\/clubs\/\d+\/leave$/) && method === 'POST') {
      const clubId = parseInt(path.split('/')[2]);
      const { userId } = await request.json();

      if (!userId) {
        return jsonResponse({ error: 'User ID required' }, 400, corsHeaders);
      }

      await env.DB.prepare(
        'DELETE FROM club_members WHERE club_id = ? AND user_id = ?'
      ).bind(clubId, userId).run();

      return jsonResponse({ message: 'Successfully left club' }, 200, corsHeaders);
    }

    // POST /api/clubs/{id}/announcements - Post club announcement
    if (path.match(/^\/clubs\/\d+\/announcements$/) && method === 'POST') {
      const clubId = parseInt(path.split('/')[2]);
      const { text } = await request.json();

      if (!text) {
        return jsonResponse({ error: 'Announcement text required' }, 400, corsHeaders);
      }

      const result = await env.DB.prepare(
        'INSERT INTO club_announcements (club_id, text) VALUES (?, ?) RETURNING *, datetime(created_at) as date'
      ).bind(clubId, text).first();

      return jsonResponse({ announcement: result }, 201, corsHeaders);
    }
    
    // GET /api/announcements - Get all general announcements
    if (path === '/announcements' && method === 'GET') {
      const announcements = await env.DB.prepare(
        'SELECT id, text, datetime(created_at) as date FROM general_announcements ORDER BY created_at DESC'
      ).all();

      return jsonResponse({ announcements: announcements.results }, 200, corsHeaders);
    }

    // POST /api/announcements - Create general announcement
    if (path === '/announcements' && method === 'POST') {
      const { text } = await request.json();

      if (!text) {
        return jsonResponse({ error: 'Announcement text required' }, 400, corsHeaders);
      }

      const result = await env.DB.prepare(
        'INSERT INTO general_announcements (text) VALUES (?) RETURNING *, datetime(created_at) as date'
      ).bind(text).first();

      return jsonResponse({ announcement: result }, 201, corsHeaders);
    }

    // DELETE /api/announcements/{id} - Delete announcement
    if (path.match(/^\/announcements\/\d+$/) && method === 'DELETE') {
      const announcementId = parseInt(path.split('/')[2]);

      await env.DB.prepare(
        'DELETE FROM general_announcements WHERE id = ?'
      ).bind(announcementId).run();

      return jsonResponse({ message: 'Announcement deleted successfully' }, 200, corsHeaders);
    }

    // GET /api/events - Get all events
    if (path === '/events' && method === 'GET') {
      const events = await env.DB.prepare(
        'SELECT id, title, description, event_date as date, club_id FROM events ORDER BY event_date ASC'
      ).all();

      return jsonResponse({ events: events.results }, 200, corsHeaders);
    }

    // GET /api/events/{id} - Get specific event
    if (path.match(/^\/events\/\d+$/) && method === 'GET') {
      const eventId = parseInt(path.split('/')[2]);

      const event = await env.DB.prepare(
        'SELECT id, title, description, event_date as date, club_id FROM events WHERE id = ?'
      ).bind(eventId).first();

      if (!event) {
        return jsonResponse({ error: 'Event not found' }, 404, corsHeaders);
      }

      return jsonResponse({ event }, 200, corsHeaders);
    }

    // POST /api/events - Create event
    if (path === '/events' && method === 'POST') {
      const { title, description, date, clubId } = await request.json();

      if (!title || !description || !date) {
        return jsonResponse({ error: 'Title, description, and date required' }, 400, corsHeaders);
      }

      const result = await env.DB.prepare(
        'INSERT INTO events (title, description, event_date, club_id) VALUES (?, ?, ?, ?) RETURNING *'
      ).bind(title, description, date, clubId || null).first();

      response = {
        event: {
          id: result.id,
          title: result.title,
          description: result.description,
          date: result.event_date,
          clubId: result.club_id
        }
      };
      return jsonResponse(response, 201, corsHeaders);
    }

    // PUT /api/events/{id} - Update event
    if (path.match(/^\/events\/\d+$/) && method === 'PUT') {
      const eventId = parseInt(path.split('/')[2]);
      const { title, description, date } = await request.json();

      await env.DB.prepare(
        'UPDATE events SET title = ?, description = ?, event_date = ? WHERE id = ?'
      ).bind(title, description, date, eventId).run();

      return jsonResponse({ message: 'Event updated successfully' }, 200, corsHeaders);
    }

    // DELETE /api/events/{id} - Delete event
    if (path.match(/^\/events\/\d+$/) && method === 'DELETE') {
      const eventId = parseInt(path.split('/')[2]);

      await env.DB.prepare(
        'DELETE FROM events WHERE id = ?'
      ).bind(eventId).run();

      return jsonResponse({ message: 'Event deleted successfully' }, 200, corsHeaders);
    }
    
    // GET /api/users - Get all users
    if (path === '/users' && method === 'GET') {
      const users = await env.DB.prepare(
        'SELECT id, email, role FROM users'
      ).all();

      return jsonResponse({ users: users.results }, 200, corsHeaders);
    }

    // GET /api/users/{id} - Get specific user
    if (path.match(/^\/users\/\d+$/) && method === 'GET') {
      const userId = parseInt(path.split('/')[2]);

      const user = await env.DB.prepare(
        'SELECT id, email, role FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!user) {
        return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
      }

      const clubs = await env.DB.prepare(
        'SELECT club_id FROM club_members WHERE user_id = ?'
      ).bind(userId).all();

      response = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          clubs: clubs.results.map(c => c.club_id)
        }
      };
      return jsonResponse(response, 200, corsHeaders);
    }

    // ============================================
    // STATS ENDPOINT
    // ============================================
    
    // GET /api/stats - Get platform statistics
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

      response = {
        stats: {
          totalClubs: clubsCount.count,
          totalUsers: usersCount.count,
          totalEvents: eventsCount.count
        }
      };
      return jsonResponse(response, 200, corsHeaders);
    }

    // If no route matches
    return jsonResponse({ error: 'Endpoint not found' }, 404, corsHeaders);

  } catch (error) {
    console.error('API Error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
}

// Helper function to create JSON responses
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}