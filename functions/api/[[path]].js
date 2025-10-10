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

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  let path = url.pathname;
  const method = request.method;

  // Remove /api prefix
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
    // AUTHENTICATION
    // ============================================
    
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

    // ============================================
    // CLUBS
    // ============================================
    
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

    if (path.match(/^\/clubs\/\d+\/join$/) && method === 'POST') {
      const clubId = parseInt(path.split('/')[2]);
      const { userId } = await request.json();

      if (!userId) {
        return jsonResponse({ error: 'User ID required' }, 400);
      }

      const club = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(clubId).first();
      if (!club) {
        return jsonResponse({ error: 'Club not found' }, 404);
      }

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

    // ============================================
    // ANNOUNCEMENTS
    // ============================================
    
    if (path === '/announcements' && method === 'GET') {
      const announcements = await env.DB.prepare(
        'SELECT id, text, datetime(created_at) as date FROM general_announcements ORDER BY created_at DESC'
      ).all();

      return jsonResponse({ announcements: announcements.results });
    }

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

    // ============================================
    // EVENTS
    // ============================================
    
    if (path === '/events' && method === 'GET') {
      const events = await env.DB.prepare(
        'SELECT e.id, e.title, e.description, e.event_date as date, e.club_id, c.name as club_name FROM events e LEFT JOIN clubs c ON e.club_id = c.id ORDER BY e.event_date ASC'
      ).all();

      return jsonResponse({ events: events.results });
    }

    if (path === '/events' && method === 'POST') {
      const { title, description, date, clubId } = await request.json();

      if (!title || !description || !date) {
        return jsonResponse({ error: 'Title, description, and date required' }, 400);
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

    // ============================================
    // STATS
    // ============================================
    
    if (path === '/stats' && method === 'GET') {
      const clubsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM clubs').first();
      const usersCount = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
      const eventsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM events').first();

      return jsonResponse({
        stats: {
          totalClubs: clubsCount.count,
          totalUsers: usersCount.count,
          totalEvents: eventsCount.count
        }
      });
    }

    // ============================================
    // HEALTH CHECK
    // ============================================
    
    if (path === '/health' || path === '/') {
      return jsonResponse({
        status: 'healthy',
        message: 'ClubHub API is running',
        timestamp: new Date().toISOString(),
        database: 'connected'
      });
    }

    return jsonResponse({ 
      error: 'Endpoint not found', 
      path, 
      method 
    }, 404);

  } catch (error) {
    console.error('❌ API Error:', error);
    return jsonResponse({ 
      error: error.message,
      stack: error.stack
    }, 500);
  }
}