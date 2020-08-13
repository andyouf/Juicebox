//provide the utility functions that the rest of our application will use
// listen for defined paths from front end ajax requests
//*puts file on live reload so we can listen to chnages
//can directly manipulate our database instead of going to postgres
const { Client } = require('pg'); // imports the pg module

// supply the db name and location of the database
const client = new Client('postgres://localhost:5432/juicebox-dev');
// const client = new Client(process.env.DATABASE_URL || 'postgres://localhost:5432/juicebox-dev');


// async function getAllUsers() {
//     const { rows } = await client.query(
//         `SELECT id, username, name, location, 
//       FROM users;
//     `);

//     return rows;
// }

async function getAllUsers() {
    // gets all users from database
    try {
        const { rows } = await client.query(`
      SELECT id, username, name, location, active 
      FROM users;
    `);

        return rows;
    } catch (error) {
        throw error;
    }
}

// async function createUser({ username, password }) {
//     try {
//       const result = await client.query(`
//         INSERT INTO users(username, password) 
//         VALUES($1, $2) 
//         ON CONFLICT (username) DO NOTHING 
//         RETURNING *;
//       `, [username, password]);

//       return result;
//     } catch (error) {
//       throw error;
//     }
//   }

//updated SQL query in order to not violate unique key constraint
async function createUser({
    username,
    password,
    name,
    location
}) {
    try {
        const { rows: [user] } = await client.query(`
      INSERT INTO users(username, password, name, location) 
      VALUES($1, $2, $3, $4) 
      ON CONFLICT (username) DO NOTHING 
      RETURNING *;
    `, [username, password, name, location]);

        return user;
    } catch (error) {
        throw error;
    }
}

async function updateUser(id, fields = {}) {
    // build the set string
    const setString = Object.keys(fields).map(
        (key, index) => `"${key}"=$${index + 1}`
    ).join(', ');

    // return early if this is called without fields
    if (setString.length === 0) {
        return;
    }

    try {
        const { rows: [user] } = await client.query(`
        UPDATE users
        SET ${ setString}
        WHERE id=${ id}
        RETURNING *;
      `, Object.values(fields));

        return user;
    } catch (error) {
        throw error;
    }
}

async function getUserById(userId) {
    try {
        const { rows: [user] } = await client.query(`
        SELECT id, username, name, location, active
        FROM users
        WHERE id=${ userId}
      `);

        if (!user) {
            return null
        }

        user.posts = await getPostsByUser(userId);

        return user;
    } catch (error) {
        throw error;
    }
}

async function createPost({
    authorId,
    title,
    content,

}) {
    try {
        const { rows: [post] } = await client.query(`
        INSERT INTO posts("authorId", title, content) 
        VALUES($1, $2, $3)
        RETURNING *;
      `, [authorId, title, content]);

    } catch (error) {
        throw error;
    }
}

async function updatePost(postId, fields = {}) {
    // build the set string
    const setString = Object.keys(fields).map(
        (key, index) => `"${key}"=$${index + 1}`
    ).join(', ');

    try {
        // update any fields that need to be updated
        if (setString.length > 0) {
            await client.query(`
          UPDATE posts
          SET ${ setString}
          WHERE id=${ postId}
          RETURNING *;
        `, Object.values(fields));
        }

        return await getPostById(postId);
    } catch (error) {
        throw error;
    }
}

async function getAllPosts() {
    try {
        const { rows: postIds } = await client.query(`
        SELECT id
        FROM posts;
      `);

        const posts = await Promise.all(postIds.map(
            post => getPostById(post.id)
        ));

        return posts;
    } catch (error) {
        throw error;
    }
}

async function getPostsByUser(userId) {
    try {
        const { rows: postIds } = await client.query(`
        SELECT id 
        FROM posts 
        WHERE "authorId"=${ userId};
      `);

        const posts = await Promise.all(postIds.map(
            post => getPostById(post.id)
        ));

        return posts;
    } catch (error) {
        throw error;
    }
}

async function getPostById(postId) {
    try {
        const { rows: [post] } = await client.query(`
        SELECT *
        FROM posts
        WHERE id=$1;
      `, [postId]);

        const { rows: [author] } = await client.query(`
        SELECT id, username, name, location
        FROM users
        WHERE id=$1;
      `, [post.authorId])

        post.author = author;

        delete post.authorId;

        return post;
    } catch (error) {
        throw error;
    }
}

// module exports
module.exports = {
    client,
    createUser,
    updateUser,
    getAllUsers,
    getUserById,
    createPost,
    updatePost,
    getAllPosts,
    getPostsByUser,
}