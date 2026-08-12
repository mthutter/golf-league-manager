import passport from "passport";
import {
    Strategy as LocalStrategy
} from "passport-local";

import {
    authenticate,
    findMemberById
} from "../services/auth.service.js";

passport.use(
    new LocalStrategy({
            usernameField: "email",
            passwordField: "password",
        },
        async (email, password, done) => {
            try {
                const user = await authenticate(email, password);

                if (!user) {
                    return done(null, false, {
                        message: "Invalid email or password.",
                    });
                }

                return done(null, user);
            } catch (err) {
                return done(err);
            }
        },
    ),
);

// Store only the member ID in the session.
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Reload the user on each request.
passport.deserializeUser(async (id, done) => {
    try {
        const user = await findMemberById(id);

        if (!user) {
            return done(null, false);
        }

        return done(null, user);
    } catch (err) {
        return done(err);
    }
});

export default passport;