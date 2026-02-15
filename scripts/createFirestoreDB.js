"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/setupFirestoreStructure.ts
var app_1 = require("firebase-admin/app");
var firestore_1 = require("firebase-admin/firestore");
var nanoid_1 = require("nanoid"); // add this
var serviceAccountKey_json_1 = require("./serviceAccountKey.json");
var serviceAccount = serviceAccountKey_json_1.default;
(0, app_1.initializeApp)({
    credential: (0, app_1.cert)(serviceAccount),
});
var db = (0, firestore_1.getFirestore)();
function setupRoom(roomId) {
    return __awaiter(this, void 0, void 0, function () {
        var roomRef, inviteCode;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    roomRef = db.collection('rooms').doc(roomId);
                    inviteCode = (0, nanoid_1.nanoid)(6);
                    // Set base room data with inviteCode
                    return [4 /*yield*/, roomRef.set({
                            name: 'Sample Room',
                            createdAt: new Date().toISOString(),
                            inviteCode: inviteCode,
                            createdBy: 'admin-script',
                            memberIds: ['admin-script'],
                        })];
                case 1:
                    // Set base room data with inviteCode
                    _a.sent();
                    // Subcollection: messages
                    return [4 /*yield*/, roomRef.collection('messages').add({
                            content: 'Hello world!',
                            senderId: 'user1',
                            senderEmail: 'test@example.com',
                            createdAt: new Date(),
                        })];
                case 2:
                    // Subcollection: messages
                    _a.sent();
                    // Subcollection: lists
                    return [4 /*yield*/, roomRef.collection('lists').add({
                            text: 'Buy groceries',
                            createdAt: new Date().toISOString(),
                        })];
                case 3:
                    // Subcollection: lists
                    _a.sent();
                    // Subcollection: events
                    return [4 /*yield*/, roomRef.collection('events').add({
                            title: 'Family Dinner',
                            date: '2025-07-01',
                        })];
                case 4:
                    // Subcollection: events
                    _a.sent();
                    // Subcollection: documents/shared (doc with id "shared")
                    return [4 /*yield*/, roomRef.collection('documents').doc('shared').set({
                            content: '<p>Welcome to your shared doc!</p>',
                        })];
                case 5:
                    // Subcollection: documents/shared (doc with id "shared")
                    _a.sent();
                    console.log("Structure for room \"".concat(roomId, "\" created successfully with inviteCode: ").concat(inviteCode));
                    return [2 /*return*/];
            }
        });
    });
}
setupRoom('sample-room-id')
    .then(function () { return process.exit(0); })
    .catch(function (err) {
    console.error('Error creating structure:', err);
    process.exit(1);
});
