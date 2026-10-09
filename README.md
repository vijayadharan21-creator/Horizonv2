# TaskForge AI — White & Blue Dual-Token Auth (PM & Developer)

A clean, modern **White and Blue** themed authentication system with **Dual-Token HTTP-Only Cookie Architecture**, supporting two core roles: **Project Manager** and **Developer**.

---

## 🌟 Highlights

1. **Clean White & Blue Theme**:
   - Modern, clutter-free light interface with crisp white cards and vibrant blue accents.
   - Clean tabs for **Sign In** and **Register**.
   - Removed unwanted clutter and complex diagnostic cards.

2. **Supported Roles**:
   - **Project Manager (`project_manager`)**: Redirects to `/dashboard/pm`.
   - **Developer (`developer`)**: Redirects to `/dashboard/developer`.

3. **Dual-Token HTTP-Only Cookie Security**:
   - **Access Token (15m)**: Sent and saved via `httpOnly`, `sameSite: 'lax'` cookie.
   - **Refresh Token (7d)**: Saved in `httpOnly` cookie and stored on User document in MongoDB for active revocation and rotation.
   - **Automatic Refresh Interceptor**: Axios automatically intercepts expired access tokens and refreshes them silently via `/api/auth/refresh`.

4. **Default Seed Accounts**:

   | Role | Email | Password | Dashboard |
   |---|---|---|---|
   | **Project Manager** | `pm@taskforge.ai` | `Password@123` | `/dashboard/pm` |
   | **Developer** | `dev@taskforge.ai` | `Password@123` | `/dashboard/developer` |

   *(Includes an **"Auto-Fill"** button on the Sign In page for 1-click testing).*

---

## 🚀 How to Run

1. **Backend Server**:
   ```bash
   cd server
   node server.js
   ```

2. **Frontend Client**:
   ```bash
   cd client
   npm run dev
   ```

3. Open **`http://localhost:5173`** in your browser to sign in or register as a Project Manager or Developer!
