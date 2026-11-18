import { useTranslations } from "@/features/marketing/model/translations";
import { Link } from "@/shared/i18n";
import { MARKETING_ASSETS } from "../model/assets";
import { ROUTES } from "@/shared/routes";
import {
  CENTER_REVIEWS,
  LEFT_REVIEWS,
  RIGHT_REVIEWS,
  type Review,
} from "../model/testimonials";

type CardProps = {
  review: Review;
  className?: string;
  align?: "left" | "right";
};

function ReviewCard({ review, className = "", align }: CardProps) {
  const t = useTranslations("Marketing");

  return (
    <article
      className={`scroll-reveal relative w-full shrink-0 overflow-hidden rounded-[24.8438px] border border-[rgba(66,81,107,0.4)] testimonial-card-bg ${
        align === "left"
          ? "xl:me-auto"
          : align === "right"
            ? "xl:ms-auto"
            : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between p-[26.4338px]">
        <div className="flex items-center gap-[11.925px]">
          <img
            src={review.avatar}
            alt={t(review.name)}
            loading="lazy"
            className="h-[50.9px] w-[50.9px] rounded-full object-cover shrink-0"
          />
          <div>
            <div className="text-[19.875px] font-semibold leading-[21.8625px] text-white">
              {t(review.name)}
            </div>
            <div className="text-[15.9px] leading-[20px] text-[#bdc5e6]">
              {t(review.handle)}
            </div>
          </div>
        </div>
      </div>

      <div className="px-[19.08px] pb-[31.8px] ps-[31.8px] pt-[23.85px]">
        <div className="text-[19.875px] font-semibold leading-[21.8625px] tracking-[-0.01em] text-white">
          {t(review.title)}
        </div>
        <div className="h-[15.9px]" />
        <p className="text-[16.695px] leading-[25.0425px] text-[#bdc5e6]">
          {t(review.content)}
        </p>
      </div>
    </article>
  );
}

export default function TestimonialsMasonry() {
  const t = useTranslations("Marketing");

  return (
    <section aria-labelledby="use-cases-title" className="marketing-testimonials relative w-full overflow-clip bg-transparent text-white">
      <div className="mx-auto w-full px-6 md:px-12 xl:px-[200.737px]">
        <div className="text-center">
          <h2 id="use-cases-title" className="[text-wrap:balance] text-[42px] font-medium leading-[1.1] tracking-[-0.01em] sm:text-[56px] md:text-[64px] xl:text-[79.5px] xl:leading-[87.45px]">
            {t("TestimonialsMasonry.yourWorkRealQuestions")}
          </h2>
          <p className="mx-auto mt-[23.85px] max-w-[784.3px] text-[18px] leading-[1.5] text-[#bdc5e6] xl:text-[21.8625px] xl:leading-[32.7938px]">
            {t(
              "TestimonialsMasonry.illustrativeUseCasesForTheIntendedBusmoraExperienceThese"
            )}
          </p>
          <div className="mt-[23.85px] flex justify-center">
            <Link
              href={ROUTES.MARKETING.DEMO}
              className="relative inline-flex items-center justify-center rounded-full border border-[#6437fc]/30 bg-[#1b1d30] px-8 py-[18px] text-[15px] font-medium text-white shadow-[0_18px_45px_-12px_rgba(100,55,252,0.55)] transition hover:border-[#7b5cff] xl:px-[45.1659px] xl:py-[23.9245px] xl:text-[17.8875px]"
            >
              {t("TestimonialsMasonry.exploreTheProduct")}
            </Link>
          </div>
        </div>
        <div className="h-[31.8px]" />
      </div>

      <div className="testimonial-masonry-layout relative z-10 mt-12 flex flex-col gap-[29.8125px] px-6 md:px-12 xl:-mt-[174.9px] xl:flex-row xl:items-stretch xl:justify-between xl:gap-0 xl:px-[49.6875px]">
        <div
          data-testimonials-column="left"
          className="testimonial-column-left flex w-full flex-col gap-[29.8125px] xl:w-[397.5px] xl:items-end"
        >
          {LEFT_REVIEWS.map((review, idx) => (
            <ReviewCard
              key={review.name}
              review={review}
              align="right"
              className={idx === 0 ? "xl:w-[298.1px]" : "xl:w-[397.5px]"}
            />
          ))}
        </div>

        <div data-testimonials-column="center" className="grid w-full grid-cols-1 gap-x-[29.8125px] gap-y-[34.98px] sm:grid-cols-2 xl:w-[954px] xl:grid-cols-6 xl:content-center xl:pt-[63.6px]">
          <ReviewCard
            review={CENTER_REVIEWS[0]}
            className="sm:col-span-1 xl:col-span-2 xl:w-[298.1px] xl:self-end"
          />
          <ReviewCard
            review={CENTER_REVIEWS[1]}
            className="sm:col-span-1 xl:col-span-2 xl:w-[298.1px] xl:self-end"
          />
          <ReviewCard
            review={CENTER_REVIEWS[2]}
            className="sm:col-span-1 xl:col-span-2 xl:w-[298.1px] xl:self-end"
          />
          <ReviewCard
            review={CENTER_REVIEWS[3]}
            className="sm:col-span-2 xl:col-span-3"
          />
          <ReviewCard
            review={CENTER_REVIEWS[4]}
            className="sm:col-span-2 xl:col-span-3"
          />
        </div>

        <div
          data-testimonials-column="right"
          className="testimonial-column-right flex w-full flex-col gap-[29.8125px] xl:w-[397.5px] xl:items-start"
        >
          {RIGHT_REVIEWS.map((review, idx) => (
            <ReviewCard
              key={review.name}
              review={review}
              align="left"
              className={idx === 0 ? "xl:w-[298.1px]" : "xl:w-[397.5px]"}
            />
          ))}
        </div>
      </div>

      <img
        src={MARKETING_ASSETS.testimonialsBackground}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="pointer-events-none absolute left-0 top-[79.5px] z-0 w-full"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[549.5px] bg-[linear-gradient(to_top,#171926,rgba(23,25,38,0.8)_79%,rgba(23,25,38,0))]" />
    </section>
  );
}
