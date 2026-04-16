1. Project Vision
A "Multi-user Real-time Generative Art Platform" for education.
* Goal: 50+ students submit physical drawings to a central teacher client.
* Result: A high-performance WebGL mosaic (15,000+ cells) rendered in real-time based on a reference feed, using student assets as "brushstrokes."
2. Core Architecture: Asymmetric Model
* Student Client (Contributor): Lightweight web UI. Captures 10 images, merges them into a Single Texture Strip, and uploads. Receives a low-frequency broadcast (1fps) of the result.
* Teacher Client (Master Renderer): Heavyweight desktop web app. Orchestrates the WebGL scene, processes the live video/image reference, and broadcasts snapshots to students.
* Backend: Supabase (Auth, Realtime, Storage, Postgres).
3. Implementation Units (The "Skills")
Unit 1: Data & Auth Foundation (Supabase)
* Schema: * rooms: id, teacher_id, join_code, status, config (JSONB for grid size/source).
    * assets: id, room_id, student_id, texture_url (Link to the 10-step atlas), metadata (JSONB).
* Security: RLS policies—Students can only INSERT assets to their joined room; Teachers have ALL access to assets in their created rooms.
Unit 2: Student Material Creator (Asset Pipeline)
* Capture: 10-slot UI for capturing physical brushstrokes via MediaDevices.
* Optimization (Atlas Stitching): Client-side Canvas logic to merge 10 100x100 crops into one 1000x100 PNG Texture Strip before upload.
* Freedom Factor: No server-side luminance validation. Allow students to experiment with "incorrect" brightness orders for creative effects.
Unit 3: Teacher's WebGL Shader Core (The Engine)
* Tech: Three.js + @react-three/fiber + Custom ShaderMaterial.
* Logic: 1. Divide reference (Webcam/Image) into a grid (e.g., 150×100). 2. Pass the reference as uRefTexture and student strips as a TextureArray or dynamic atlas. 3.  Fragment Shader: * Calculate luminance of uRefTexture at current UV. * Map luminance to 0.0−1.0 range. * Sample the corresponding 1/10 segment of the student's texture strip. * Requirement: Output original RGB color from student's art (no grayscale conversion).
* Performance: Maintain 60fps at high grid resolutions.
Unit 4: Broadcast & Sync Service (Live Feed)
* Teacher Side: * Every 1000ms (1fps), capture a low-res snapshot of the WebGL Canvas: canvas.toBlob(..., 0.5).
    * Overwrite rooms/{id}/broadcast.jpg in Supabase Storage.
    * Send a Realtime "tick" message with a timestamp.
* Student Side: * Listen for "tick" via Supabase Realtime.
    * Refresh <img> source with a cache-busting query: .../broadcast.jpg?t={timestamp}.
4. Tech Stack Requirements
* Framework: Next.js (App Router), TypeScript, Tailwind CSS.
* 3D/Graphics: Three.js, GLSL.
* Backend: Supabase (Auth, DB, Storage, Realtime).
5. Execution Guidelines for Claude Code
1. Phase 1 (The Architect): Define Postgres types and RLS first. Strictly type the assets metadata.
2. Phase 2 (The Shader Specialist): Implement the 1000x100 texture sampling logic in GLSL before building the full UI. Test with mock textures.
3. Phase 3 (The UI Builder): Build the Student "10-slot" capture flow and the Teacher "Staging Queue".
4. Phase 4 (The Streamer): Implement the 1fps snapshot broadcasting logic.
