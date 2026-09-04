// Design philosophy: ساحل المستقبل — keep the shell quiet and let the coastal editorial homepage carry the brand.
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LocaleProvider } from "./i18n";
import Home from "./pages/Home";
import MobileApp from "./pages/MobileApp";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

function Router() {
  return <Switch><Route path="/" component={MobileApp} /><Route path="/app" component={MobileApp} /><Route path="/landing" component={Home} /><Route path="/login" component={Login} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><LocaleProvider><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="bottom-left" /><Router /></TooltipProvider></ThemeProvider></LocaleProvider></ErrorBoundary>;
}
