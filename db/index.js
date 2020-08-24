//provide the utility functions that the rest of application will use
//listen for defined paths from front end Ajax requests
//puts file on live reload so can listen to chnages
//can directly manipulate database instead of going to postgres
const { Client } = require('pg'); // imports the pg module

// supply the db name and location of the database
const client = new Client('postgres://localhost:5432/juicebox-dev');
// const client = new Client(process.env.DATABASE_URL || 'postgres://localhost:5432/juicebox-dev');

/**
 * USER Methods
 */

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

// async function getAllUsers() {
//     const { rows } = await client.query(
//         `SELECT id, username, name, location, 
//       FROM users;
//     `);

//     return rows;
// }

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

/**
 * POST Methods
 */

// use placeholders, and pass the values as the second argument of query
// # of items in tag list being passed into function
async function createPost({
    authorId,
    title,
    content,
    tags = []
}) {
    try {
        const { rows: [post] } = await client.query(`
        INSERT INTO posts("authorId", title, content) 
        VALUES($1, $2, $3)
        RETURNING *;
      `, [authorId, title, content]);
        //  this function has been updated to handle creating tags; do not need createInitialTags
        const tagList = await createTags(tags);

        return await addTagsToPost(post.id, tagList);
    } catch (error) {
        throw error;
    }
}

async function updatePost(postId, fields = {}) {
    // read off the tags & remove that field 
    const { tags } = fields; // might be undefined
    delete fields.tags;

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

        // return early if there's no tags to update
        if (tags === undefined) {
            return await getPostById(postId);
        }

        // make any new tags that need to be made
        const tagList = await createTags(tags);
        const tagListIdString = tagList.map(
            tag => `${tag.id}`
        ).join(', ');

        // delete any post_tags from the database which aren't in that tagList
        await client.query(`
        DELETE FROM post_tags
        WHERE "tagId"
        NOT IN (${ tagListIdString})
        AND "postId"=$1;
      `, [postId]);

        // create post_tags as necessary
        await addTagsToPost(postId, tagList);

        return await getPostById(postId);
    } catch (error) {
        throw error;
    }
}

// get associated information (tags and author) on each post
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

async function getPostById(postId) {
    // getting post itself then tags using JOIN stmt
    try {
        const { rows: [post] } = await client.query(`
        SELECT *
        FROM posts
        WHERE id=$1;
      `, [postId]);

        const { rows: tags } = await client.query(`
        SELECT tags.*
        FROM tags
        JOIN post_tags ON tags.id=post_tags."tagId"
        WHERE post_tags."postId"=$1;
      `, [postId])
        // add tags and author to post before returning it
        const { rows: [author] } = await client.query(`
        SELECT id, username, name, location
        FROM users
        WHERE id=$1;
      `, [post.authorId])

        post.tags = tags;
        // remove the authorId since it is encapsulated in the author property
        post.author = author;

        delete post.authorId;

        return post;
    } catch (error) {
        throw error;
    }
}

// two new keys author and tags will have the info being created
// modify the original query just to return the post id so can iterate over each post calling our updated getPostById, which has all the information
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

async function getPostsByTagName(tagName) {
    try {
        const { rows: postIds } = await client.query(`
        SELECT posts.id
        FROM posts
        JOIN post_tags ON posts.id=post_tags."postId"
        JOIN tags ON tags.id=post_tags."tagId"
        WHERE tags.name=$1;
      `, [tagName]);

        return await Promise.all(postIds.map(
            post => getPostById(post.id)
        ));
    } catch (error) {
        throw error;
    }
}

/**
 * TAG Methods
 */

// insert multiple values at same time
async function createTags(tagList) {
    if (tagList.length === 0) {
        return;
    }

    const valuesStringInsert = tagList.map(
        (_, index) => `$${index + 1}`
    ).join('), (');

    const valuesStringSelect = tagList.map(
        (_, index) => `$${index + 1}`
    ).join(', ');

    try {
        // insert all, ignoring duplicates
        // replace strings with placeholders from tag list and pass values second argument
        await client.query(`
  
      INSERT INTO tags(name)
      VALUES (${ valuesStringInsert})
      ON CONFLICT (name) DO NOTHING;
    `, tagList);

        // grab all and return
        const { rows } = await client.query(`
      SELECT * FROM tags
      WHERE name
      IN (${ valuesStringSelect});
    `, tagList);

        return rows;
    } catch (error) {
        throw error;
    }
}

async function createPostTag(postId, tagId) {
    try {
        await client.query(`
      INSERT INTO post_tags("postId", "tagId")
      VALUES ($1, $2)
      ON CONFLICT ("postId", "tagId") DO NOTHING;
    `, [postId, tagId]);
    } catch (error) {
        throw error;
    }
}
// the function createPostTag is async, so it returns a promise so if we make an array of non-await calls, we can use them with Promise.all, and then await that
async function addTagsToPost(postId, tagList) {
    try {
        const createPostTagPromises = tagList.map(
            tag => createPostTag(postId, tag.id)
        );

        await Promise.all(createPostTagPromises);

        return await getPostById(postId);
    } catch (error) {
        throw error;
    }
}

async function getAllTags() {
    try {
        // insert the tags, doing nothing on conflict
        // returning nothing, query after
        const { rows } = await client.query(`
      SELECT * 
      FROM tags;
    `);
        // select all tags where the name is in our taglist
        // return the rows from the query
        return { rows }
    } catch (error) {
        throw error;
    }
}

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
    getPostsByTagName,
    createTags,
    getAllTags,
    createPostTag,
    addTagsToPost
}