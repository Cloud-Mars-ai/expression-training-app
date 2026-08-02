import { Navigate, Route, Routes } from "react-router-dom";
import { FocusShell } from "./components/layout/FocusShell";
import { LightShell } from "./components/layout/LightShell";
import { ResultShell } from "./components/layout/ResultShell";
import { StructuredTrainingFocusPage } from "./pages/StructuredTrainingFocusPage";
import { GrowthPage } from "./pages/GrowthPage";
import { HomePage } from "./pages/HomePage";
import { MePage } from "./pages/MePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { FrameworkSelectionPage } from "./pages/FrameworkSelectionPage";
import { StructuredExerciseDetailPage } from "./pages/StructuredExerciseDetailPage";
import { StructuredExpressionLandingPage } from "./pages/StructuredExpressionLandingPage";
import { TechnicalFailurePage } from "./pages/TechnicalFailurePage";
import { TrainingResultPage } from "./pages/TrainingResultPage";
import { TrainingPage } from "./pages/TrainingPage";
import { TrainingCapabilityPlaceholder } from "./pages/TrainingCapabilityPlaceholder";
import { TranscriptReviewPage } from "./pages/TranscriptReviewPage";
import { AskOneMoreCoursePage } from "./pages/AskOneMoreCoursePage";

export default function App() {
  return (
    <Routes>
      <Route element={<LightShell />}>
        <Route index element={<Navigate replace to="/home" />} />
        <Route path="home" element={<HomePage />} />
        <Route path="training" element={<TrainingPage />} />
        <Route path="training/structure" element={<StructuredExpressionLandingPage />} />
        <Route path="training/:capability" element={<TrainingCapabilityPlaceholder />} />
        <Route path="growth" element={<GrowthPage />} />
        <Route path="me" element={<MePage />} />
        <Route path="microcourse/ask-one-more" element={<AskOneMoreCoursePage />} />
      </Route>
      <Route element={<FocusShell />}>
        <Route path="focus/:stage" element={<StructuredTrainingFocusPage />} />
      </Route>
      <Route element={<ResultShell />}>
        <Route path="exercise/:exerciseId" element={<StructuredExerciseDetailPage />} />
        <Route path="exercise/:exerciseId/framework" element={<FrameworkSelectionPage />} />
        <Route path="result/:attemptId" element={<TrainingResultPage />} />
        <Route path="attempt/:attemptId/transcript" element={<TranscriptReviewPage />} />
        <Route path="technical-error/:attemptId" element={<TechnicalFailurePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
