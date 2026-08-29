// Design philosophy: ساحل المستقبل — keep the shell quiet and let the coastal editorial homepage carry the brand.
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import MobileApp from "./pages/MobileApp";
import NotFound from "./pages/NotFound";

function Router() {
  return <Switch><Route path="/" component={MobileApp} /><Route path="/app" component={MobileApp} /><Route path="/landing" component={Home} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="bottom-left" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
