package com.parkinggack.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.parkinggack.app.R

/**
 * 차 화면 글자 (tokens-jettae.json → type → 차 화면). 숫자는 모두 고정폭(tnum).
 * 차 화면에서는 caption(14)보다 작게 쓰지 않는다.
 * 글꼴: 시안과 같은 Noto Sans KR 400/500/700 (res/font, OFL). 용량을 줄이려고 KS X 1001 한글 2,350자 +
 * 라틴·기호만 남긴 부분 집합이라, 없는 글자는 시스템 글꼴(AAOS Noto Sans CJK)로 자동 대체된다.
 */
@Immutable
data class ParkingType(
    /** 72/84 bold — 주행 중 큰 숫자 한 줄. 화면당 하나 */
    val display: TextStyle,
    /** 34/44 bold — 정차 중 질문과 제목 */
    val title: TextStyle,
    /** 22/32 bold — 섹션 제목, 카드 제목 */
    val heading: TextStyle,
    /** 20/30 regular — 상태 문장과 설명 */
    val body: TextStyle,
    /** 16/22 bold — 칩, 막대 라벨 */
    val label: TextStyle,
    /** 14/20 regular — 가장 작은 글자 */
    val caption: TextStyle,
)

private const val TABULAR = "tnum"

/**
 * 한글을 어절(띄어쓰기) 단위로 줄바꿈한다. 기본값은 음절마다 끊어 "드릴게 / 요"처럼 단어가 갈라진다.
 * Phrase는 글자의 언어가 한국어로 정해져 있어야 먹으므로 localeList도 함께 준다 (Android 13+, Pleos는 14).
 */
private val KoreanWordBreak = LineBreak.Paragraph.copy(wordBreak = LineBreak.WordBreak.Phrase)
private val Korean = LocaleList("ko-KR")

/** Noto Sans KR 한 줄 높이 = (hhea ascent 1160 + descent 288) / 1000. CSS `line-height: normal`과 같다. */
const val NOTO_SANS_KR_LINE_RATIO = 1.448f

/** Noto Sans KR (시안 글꼴). 600 이상은 Bold, 500은 Medium, 그 아래는 Regular 파일로. */
val NotoSansKr = FontFamily(
    Font(R.font.noto_sans_kr_regular, FontWeight.Normal),
    Font(R.font.noto_sans_kr_medium, FontWeight.Medium),
    Font(R.font.noto_sans_kr_bold, FontWeight.Bold),
)

private fun style(size: Int, lineHeight: Int, weight: FontWeight, letterSpacing: TextUnit = TextUnit.Unspecified) = TextStyle(
    fontFamily = NotoSansKr,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    fontWeight = weight,
    letterSpacing = letterSpacing,
    fontFeatureSettings = TABULAR,
    localeList = Korean,
    lineBreak = KoreanWordBreak,
)

val DefaultParkingType = ParkingType(
    display = style(72, 84, FontWeight.Bold, (-0.01).em),
    title = style(34, 44, FontWeight.Bold),
    heading = style(22, 32, FontWeight.Bold),
    body = style(20, 30, FontWeight.Normal),
    label = style(16, 22, FontWeight.Bold),
    caption = style(14, 20, FontWeight.Normal),
)

/** 시안 고유 크기(28, 52, 96 …)가 필요할 때. 줄 높이는 기본 1.3배. */
fun TextStyle.sized(size: TextUnit, lineHeightMultiplier: Float = 1.3f, weight: FontWeight? = null): TextStyle =
    copy(fontSize = size, lineHeight = size * lineHeightMultiplier, fontWeight = weight ?: fontWeight)

/**
 * 층·점수처럼 아주 큰 숫자: 줄 높이를 글자 크기의 [lineHeight]배로 (시안은 대부분 `line-height: 1`, C-05 층은 0.85),
 * 자간을 좁힌다. 한 줄 글자에서 이 줄 높이가 실제로 먹게 하려면 `Modifier.cssLineBox(style)`를 함께 쓴다.
 */
fun TextStyle.hero(size: TextUnit, letterSpacing: TextUnit = (-0.02).em, lineHeight: Float = 1f): TextStyle =
    copy(fontSize = size, lineHeight = size * lineHeight, fontWeight = FontWeight.Bold, letterSpacing = letterSpacing)
