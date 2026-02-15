// lib/auth.ts
import {auth, db} from './firebase';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    verifyPasswordResetCode,
    confirmPasswordReset,
    updateProfile,
} from 'firebase/auth';
import {doc, getDoc, setDoc} from "firebase/firestore";

export const signup = async (email: string, password: string, displayName?: string) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Set display name on Firebase Auth profile
        if (displayName?.trim()) {
            await updateProfile(user, { displayName: displayName.trim() });
        }

        // Create Firestore user doc with name
        try {
            await setDoc(doc(db, 'users', user.uid), {
                email: user.email,
                name: displayName?.trim() || '',
                createdAt: new Date().toISOString(),
            });
        } catch (e) {
            console.warn('Signup succeeded but Firestore user doc not saved:', e);
        }

        return userCredential;
    } catch (error: any) {
        throw {
            code: error.code || 'signup-failed',
            message: error.message || 'Signup failed',
        };
    }
};

export const login = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    // Ensure user doc exists and sync display name (non-blocking)
    try {
        const user = userCredential.user;
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await setDoc(userDocRef, {
                email: user.email,
                name: user.displayName || '',
                createdAt: new Date().toISOString(),
            });
        } else {
            // If user has a name in Firestore but not on Auth profile, sync it
            const data = userDocSnap.data();
            if (data?.name && !user.displayName) {
                await updateProfile(user, { displayName: data.name });
            }
        }
    } catch (firestoreError) {
        console.warn('Login succeeded but Firestore sync failed:', firestoreError);
    }

    return userCredential;
};

export const resetPassword = async (email: string) => {
    try {
        await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
        throw {
            code: error.code || 'reset-failed',
            message: error.message || 'Password reset failed',
        };
    }
};

export const verifyResetCode = async (oobCode: string) => {
    try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        return email;
    } catch (error: any) {
        throw {
            code: error.code || 'invalid-code',
            message: error.message || 'Invalid or expired reset link',
        };
    }
};

export const confirmReset = async (oobCode: string, newPassword: string) => {
    try {
        await confirmPasswordReset(auth, oobCode, newPassword);
    } catch (error: any) {
        throw {
            code: error.code || 'reset-failed',
            message: error.message || 'Password reset failed',
        };
    }
};

export const logout = async () => {
    await signOut(auth);
};
