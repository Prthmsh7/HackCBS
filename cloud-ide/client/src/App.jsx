import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Terminal from "./components/terminal";
import FileTree from "./components/tree";
import socket from "../src/socket";
import AceEditor from "react-ace";
import { getFileMode } from "./utils/getFileMode";

import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/ext-language_tools";

function App() {
  const [fileTree, setFileTree] = useState({});
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState("");  // Room state
  const [userName, setUserName] = useState(""); // Optional, for user identification

  const isSaved = selectedFileContent === code;

  // Function to generate a random room number
  const generateRoom = () => {
    const roomNumber = Math.floor(Math.random() * 10000) + 1000;  // Generates a random number between 1000 and 9999
    setRoom(roomNumber.toString());
  };

  // Emit changes to the file every 5 seconds
  useEffect(() => {
    if (!isSaved && code) {
      const timer = setTimeout(() => {
        socket.emit("file:change", {
          path: selectedFile,
          content: code,
          room,  // Send room with content update
        });
      }, 5 * 1000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [code, selectedFile, isSaved, room]); // Added room as dependency

  useEffect(() => {
    setCode(""); // Reset code when file changes
  }, [selectedFile]);

  useEffect(() => {
    setCode(selectedFileContent); // Sync code with content
  }, [selectedFileContent]);

  // Fetch the file tree for the current room
  const getFileTree = useCallback(async () => {
    if (!room) return;
    const response = await fetch(`http://localhost:9000/files?room=${room}`);
    const result = await response.json();
    setFileTree(result.tree);
  }, [room]);

  // Fetch file content when a file is selected
  const getFileContents = useCallback(async () => {
    if (!selectedFile || !room) return;
    const response = await fetch(
      `http://localhost:9000/files/content?path=${selectedFile}&room=${room}`
    );
    const result = await response.json();
    setSelectedFileContent(result.content);
  }, [selectedFile, room]);

  useEffect(() => {
    if (selectedFile) getFileContents();
  }, [getFileContents, selectedFile]);

  useEffect(() => {
    socket.on("file:refresh", getFileTree); // Listen for file refresh events
    socket.on("file:update", ({ path, content }) => {
      if (path === selectedFile) {
        setSelectedFileContent(content);
        setCode(content);
      }
    });
    return () => {
      socket.off("file:refresh", getFileTree);
      socket.off("file:update");
    };
  }, [selectedFile, getFileTree]);

  // Handle room join action
  const handleJoinRoom = () => {
    if (room) {
      socket.emit("join:room", { room, userName });  // Emit the room and userName to join
      getFileTree(); // Refresh file tree on room join
    }
  };

  return (
    <div className="playground-container">
      <div className="room-container">
        <input
          type="text"
          placeholder="Enter Room Name"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        />
        <button onClick={generateRoom}>Generate Room</button>  {/* Button to generate a random room */}
        <input
          type="text"
          placeholder="Enter Your Name"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
        <button onClick={handleJoinRoom}>Join Room</button>
      </div>

      {room && (
        <div className="editor-container">
          <div className="files">
            <FileTree
              onSelect={(path) => {
                setSelectedFileContent(""); // Reset content on file select
                setSelectedFile(path);
              }}
              tree={fileTree}
            />
          </div>
          <div className="editor">
            {selectedFile && (
              <p>
                {selectedFile.replaceAll("/", " > ")}{" "}
                {isSaved ? "Saved" : "Unsaved"}
              </p>
            )}
            <AceEditor
              width="100%"
              mode={getFileMode({ selectedFile })}
              value={code}
              onChange={(e) => setCode(e)}
            />
          </div>
        </div>
      )}

      <div className="terminal-container">
        <Terminal room={room} /> {/* Pass the room info to Terminal component */}
      </div>
    </div>
  );
}

export default App;
