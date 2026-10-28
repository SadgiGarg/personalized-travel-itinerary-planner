import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import PlannerApp from "./PlannerApp.jsx";
import "./styles.css";
createRoot(document.getElementById("root")).render(<React.StrictMode><BrowserRouter><Routes>
  <Route path="/" element={<PlannerApp page="home" />} />
  <Route path="/login" element={<PlannerApp page="login" />} />
  <Route path="/signup" element={<PlannerApp page="signup" />} />
  <Route path="/plan-trip" element={<PlannerApp page="plan-trip" />} />
  <Route path="/itinerary/:id" element={<PlannerApp page="itinerary" />} />
  <Route path="/saved-trips" element={<PlannerApp page="saved-trips" />} />
  <Route path="*" element={<PlannerApp page="not-found" />} />
</Routes></BrowserRouter></React.StrictMode>);
