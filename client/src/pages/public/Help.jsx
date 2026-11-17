import { Link } from 'react-router-dom';
import { Page, Card } from '../../components/ui.jsx';

export default function Help() {
  return (
    <Page crumb={[{ label: 'Тусламж' }]} title="Мэдээллийн заавар" subtitle="Системийг хэрхэн ашиглах, юуг хариуцдаг вэ">
      <div className="grid grid-2">
        <Card className="prose">
          <h2>Мэдүүлэг илгээх алхам</h2>
          <ol>
            <li><Link to="/visas">Визийн мэдээлэл</Link> хэсгээс ангиллаа сонгож материалын жагсаалтыг уншина.</li>
            <li>Бүртгүүлж нэвтэрнэ.</li>
            <li>Анкетаа паспорт дээрх латин бичлэгээр бөглөнө.</li>
            <li>Материал бүрийг PDF, JPG, PNG хэлбэрээр хавсаргана (файл ≤10 MB, нийт ≤100 MB).</li>
            <li>Мэдээллээ хянаад илгээнэ. Дотоод лавлах дугаар олгоно.</li>
          </ol>
        </Card>
        <Card className="prose">
          <h2>Чухал тэмдэглэл</h2>
          <ul>
            <li>“Цахимаар мэдүүлэх” нь операторт хүсэлт илгээх гэсэн үг; ЭСЯ-ны системд шууд бүртгэгдэхгүй.</li>
            <li>Дотоод лавлах дугаар нь албан ёсны визийн дугаар биш.</li>
            <li>Операторын “Бүрдэл бүрэн / дутуу” үнэлгээ нь виз олгох шийдвэр биш.</li>
            <li>Албан ёсны хариуг Korea Visa Portal-аас шалгана. Портал дээр хариу олдохгүй бол татгалзсан гэж бүү дүгнэ.</li>
            <li>Паспортын эх хувийг материал хүлээлгэн өгөхдөө авч очно.</li>
          </ul>
        </Card>
        <Card className="prose">
          <h2>Холбоо барих (албан ёсны эх сурвалж)</h2>
          <ul>
            <li>БНСУ-ын ЭСЯ — визийн утас: +976 7007-1030</li>
            <li>Монгол дахь KVAC — <a href="https://www.visaforkorea.mn" target="_blank" rel="noopener noreferrer">visaforkorea.mn</a></li>
            <li>Korea Visa Portal — <a href="https://www.visa.go.kr" target="_blank" rel="noopener noreferrer">visa.go.kr</a></li>
          </ul>
          <p className="small muted">Эх сурвалжийг 2026-10-30-нд шалгасан. Мэдүүлэг өгөхийн өмнө дахин нягтална уу.</p>
        </Card>
        <Card className="prose">
          <h2>Хувийн мэдээлэл</h2>
          <p>Паспортын дугаарыг сервер дээр шифрлэж хадгална. Хавсралтыг зөвхөн та болон хуваарилагдсан оператор нээнэ; админ эрх таны файлыг үзэх эрх биш. Порталын нууц үгийг энэ системд хэзээ ч оруулахгүй.</p>
        </Card>
      </div>
    </Page>
  );
}
