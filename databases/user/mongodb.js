import * as properties from '../../properties/properties.js';
import * as errors from '../../services/errors.js';

import * as mongoose from 'mongoose';

import UserSchema from './userSchema.js';

/** @type { mongoose.Connection } */
let connection;

export async function initialize(dbUrl) {
    connection = await mongoose.createConnection(dbUrl || properties.getMongoDbUrl()).asPromise();
    initialize_user_model(connection);
}

export function close() {
    return connection.close();
}

/** 
 * User Model
 * @type mongoose.Model
 */
let User;

/**
 * @param { mongoose.Connection } connection
 */
function initialize_user_model(connection) {
    User = connection.model('User', UserSchema, 'User');
}

export async function find_user(uid) {
    const user = await User.findOne({ 'uid': uid });

    if (user) {
        return user;
    } else {
        if (properties.getEsupProperty('auto_create_user')) {
            return create_user(uid);
        } else {
            throw new errors.UserNotFoundError();
        }
    }
}

export function create_user(uid) {
    return save_user(new User({ uid: uid }));
}

export function save_user(user) {
    return user.save();
}

/**
 * Supprime l'utilisateur
 */
export function remove_user(uid) {
    return User.deleteOne({ uid: uid });
}
