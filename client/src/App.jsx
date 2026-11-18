import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { RequireRole } from './auth.jsx';
import { Page, Empty, LinkButton } from './components/ui.jsx';
import Home from './pages/public/Home.jsx';
import Login from './pages/public/Login.jsx';
import Register from './pages/public/Register.jsx';
import Visas from './pages/public/Visas.jsx';
import VisaDetail from './pages/public/VisaDetail.jsx';
import Help from './pages/public/Help.jsx';
import Mfa from './pages/public/Mfa.jsx';
import ForgotPassword from './pages/public/ForgotPassword.jsx';
import ResetPassword from './pages/public/ResetPassword.jsx';
import VerifyEmail from './pages/public/VerifyEmail.jsx';
import AppDashboard from './pages/app/Dashboard.jsx';
import NewForm from './pages/app/NewForm.jsx';
import NewDocuments from './pages/app/NewDocuments.jsx';
import NewConfirm from './pages/app/NewConfirm.jsx';
import Submitted from './pages/app/Submitted.jsx';
import Archive from './pages/app/Archive.jsx';
import ApplicationDetail from './pages/app/ApplicationDetail.jsx';
import Profile from './pages/app/Profile.jsx';
import OfficialResult from './pages/app/OfficialResult.jsx';
import Imports from './pages/app/Imports.jsx';
import Documents from './pages/app/Documents.jsx';
import ImportNew from './pages/app/ImportNew.jsx';
import ImportDetail from './pages/app/ImportDetail.jsx';
import Worklist from './pages/operator/Worklist.jsx';
import Review from './pages/operator/Review.jsx';
import ReviewHistory from './pages/operator/ReviewHistory.jsx';
import MyReviews from './pages/operator/MyReviews.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import Countries from './pages/admin/Countries.jsx';
import VisaTypes from './pages/admin/VisaTypes.jsx';
import Versions from './pages/admin/Versions.jsx';
import VersionEdit from './pages/admin/VersionEdit.jsx';
import Requirements from './pages/admin/Requirements.jsx';
import Users from './pages/admin/Users.jsx';
import Assignments from './pages/admin/Assignments.jsx';
import Audit from './pages/admin/Audit.jsx';
import DeletionRequests from './pages/admin/DeletionRequests.jsx';
import Stats from './pages/admin/Stats.jsx';
import { t } from './i18n.js';
const guard = (role, el) => <RequireRole role={role}>{el}</RequireRole>;
function NotFound() {
  return (
    <Page title={t('Хуудас олдсонгүй')}>
      <Empty title={t('Энэ хаягаар хуудас алга')} action={<LinkButton to="/">{t('Нүүр рүү')}</LinkButton>}>
        {t('Холбоос буруу эсвэл хуудас шилжсэн байж болно.')}
      </Empty>
    </Page>
  );
}
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Зочин — Зураг 37–41 */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/visas" element={<Visas />} />
        <Route path="/visas/:versionId" element={<VisaDetail />} />
        <Route path="/help" element={<Help />} />
        {/* Үе 2 — 2FA, нууц үг сэргээх, имэйл баталгаажуулалт */}
        <Route path="/login/mfa" element={<Mfa />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* Мэдүүлэгч — Зураг 42–50 */}
        <Route path="/app" element={guard('APPLICANT', <AppDashboard />)} />
        <Route path="/app/new" element={guard('APPLICANT', <NewForm />)} />
        <Route path="/app/new/documents" element={guard('APPLICANT', <NewDocuments />)} />
        <Route path="/app/new/confirm" element={guard('APPLICANT', <NewConfirm />)} />
        <Route path="/app/submitted/:id" element={guard('APPLICANT', <Submitted />)} />
        <Route path="/app/applications" element={guard('APPLICANT', <Archive />)} />
        <Route path="/app/applications/:id" element={guard('APPLICANT', <ApplicationDetail />)} />
        <Route path="/app/profile" element={guard('APPLICANT', <Profile />)} />
        <Route path="/app/official-result" element={guard('APPLICANT', <OfficialResult />)} />
        <Route path="/app/imports" element={guard('APPLICANT', <Imports />)} />
        <Route path="/app/documents" element={guard('APPLICANT', <Documents />)} />
        <Route path="/app/imports/new" element={guard('APPLICANT', <ImportNew />)} />
        <Route path="/app/imports/:id" element={guard('APPLICANT', <ImportDetail />)} />

        {/* Оператор — Зураг 51–53 */}
        <Route path="/operator" element={guard('OPERATOR', <Worklist />)} />
        <Route path="/operator/applications/:id" element={guard('OPERATOR', <Review />)} />
        <Route path="/operator/applications/:id/history" element={guard('OPERATOR', <ReviewHistory />)} />
        <Route path="/operator/history" element={guard('OPERATOR', <MyReviews />)} />
        <Route path="/operator/profile" element={guard('OPERATOR', <Profile />)} />

        {/* Админ — Зураг 54–61 */}
        <Route path="/admin" element={guard('ADMIN', <AdminDashboard />)} />
        <Route path="/admin/countries" element={guard('ADMIN', <Countries />)} />
        <Route path="/admin/visa-types" element={guard('ADMIN', <VisaTypes />)} />
        <Route path="/admin/visa-types/:id/versions" element={guard('ADMIN', <Versions />)} />
        <Route path="/admin/visa-types/:id/versions/new" element={guard('ADMIN', <VersionEdit />)} />
        <Route path="/admin/versions/:versionId" element={guard('ADMIN', <VersionEdit />)} />
        <Route path="/admin/versions/:id/requirements" element={guard('ADMIN', <Requirements />)} />
        <Route path="/admin/users" element={guard('ADMIN', <Users />)} />
        <Route path="/admin/assignments" element={guard('ADMIN', <Assignments />)} />
        <Route path="/admin/audit" element={guard('ADMIN', <Audit />)} />
        <Route path="/admin/stats" element={guard('ADMIN', <Stats />)} />
        <Route path="/admin/deletion-requests" element={guard('ADMIN', <DeletionRequests />)} />
        <Route path="/admin/profile" element={guard('ADMIN', <Profile />)} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
